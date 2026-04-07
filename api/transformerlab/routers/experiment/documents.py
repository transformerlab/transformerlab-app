import datetime
import logging
import os
import tempfile
import zipfile

import httpx
from fastapi import APIRouter, Body, HTTPException, UploadFile, Response
from fastapi.responses import StreamingResponse
from werkzeug.utils import secure_filename
from urllib.parse import urlparse

from transformerlab.shared.shared import slugify, get_media_type

from lab import Experiment, storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])
FOLDER_MARKER_FILE = ".keep"

allowed_file_types = [
    ".txt",
    ".jsonl",
    ".pdf",
    ".csv",
    ".epub",
    ".ipynb",
    ".md",
    ".mbox",
    ".docx",
    ".ppt",
    ".pptm",
    ".pptx",
    ".zip",
]

# Whitelist of allowed domains for URL validation
ALLOWED_DOMAINS = {"recipes.transformerlab.net", "www.learningcontainer.com"}


def is_valid_url(url: str) -> bool:
    """Validate the URL to ensure it points to an allowed domain."""
    try:
        parsed_url = urlparse(url)
        if parsed_url.scheme not in {"http", "https"}:
            return False
        domain = parsed_url.netloc.split(":")[0]  # Extract domain without port
        return domain in ALLOWED_DOMAINS
    except Exception:
        return False


# # Get info on dataset from huggingface
# @router.get("/{document_name}/info", summary="Fetch the details of a particular document.")
# async def document_info():
#     r = {"message": "This endpoint is not yet implemented"}
#     return r


@router.get("/open/{document_name}", summary="View the contents of a document.")
async def document_view(experimentId: str, document_name: str, folder: str = None):
    try:
        exp_obj = Experiment(experimentId)
        experiment_dir = await exp_obj.get_dir()

        document_name = secure_filename(document_name)
        folder = secure_filename(folder) if folder else ""

        if folder and folder != "":
            file_location = storage.join(experiment_dir, "documents", folder, document_name)
        else:
            file_location = storage.join(experiment_dir, "documents", document_name)

        if not await storage.exists(file_location):
            raise HTTPException(status_code=404, detail=f"Document '{document_name}' not found")

        # Determine media type from extension
        _, ext = os.path.splitext(document_name.lower())
        media_type = get_media_type(document_name)

        # For text-like files, read and return directly
        text_types = {".txt", ".md", ".csv", ".json", ".jsonl", ".xml", ".html", ".mbox", ".ipynb"}
        if ext in text_types:
            try:
                async with await storage.open(file_location, "r", encoding="utf-8") as f:
                    content = await f.read()
                return Response(content, media_type=media_type)
            except Exception as e:
                logger.warning(f"Failed to read file as text, falling back to binary: {e}")

        # For binary files (PDF, DOCX, etc.), stream the content
        async def generate():
            async with await storage.open(file_location, "rb") as f:
                while True:
                    chunk = await f.read(8192)
                    if not chunk:
                        break
                    yield chunk

        return StreamingResponse(
            generate(),
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="{document_name}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error retrieving document")


@router.get("/list", summary="List available documents.")
async def document_list(experimentId: str, folder: str = None):
    documents = []
    tfl_remote_storage_enabled = os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true"
    use_detail = not tfl_remote_storage_enabled  # no size/mtime when remote
    # List the files that are in the experiment/<experiment_name>/documents directory:
    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    documents_dir = storage.join(experiment_dir, "documents")
    folder = secure_filename(folder)
    if folder and folder != "":
        if await storage.exists(storage.join(documents_dir, folder)):
            documents_dir = storage.join(documents_dir, folder)
        else:
            return {"status": "error", "message": f'Folder "{folder}" not found'}
    if await storage.exists(documents_dir):
        try:
            entries = await storage.ls(documents_dir, detail=use_detail)
        except Exception as e:
            print(f"Error listing documents: {e}")
            entries = []
        for entry in entries:
            # With detail=True (local): entry is dict. With detail=False (remote): entry is path string.
            if isinstance(entry, dict):
                full_path = entry.get("name") or entry.get("path") or ""
                name = os.path.basename(full_path.rstrip("/"))
                is_dir = entry.get("type") == "directory"
                size = int(entry.get("size") or 0)
                mtime = entry.get("mtime")
            else:
                full_path = entry
                name = os.path.basename(full_path.rstrip("/"))
                is_dir = await storage.isdir(full_path)
                size = 0 if is_dir else 0
                mtime = None
            if name in {".tlab_markitdown", FOLDER_MARKER_FILE}:
                continue
            if is_dir:
                date_str = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S") if mtime else ""
                documents.append({"name": name, "size": 0, "date": date_str, "type": "folder", "path": full_path})
            else:
                if any(name.endswith(ext) for ext in allowed_file_types):
                    date_str = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S") if mtime else ""
                    ext = os.path.splitext(name)[1]
                    documents.append({"name": name, "size": size, "date": date_str, "type": ext, "path": full_path})

    return documents  # convert list to JSON object


@router.get("/new", summary="Create a new document.")
async def document_new(experimentId: str, dataset_id: str):
    print("Not yet implemented")
    return {"status": "success", "dataset_id": dataset_id}


@router.get("/delete", summary="Delete a document.")
async def delete_document(experimentId: str, document_name: str, folder: str = None):
    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()

    document_name = secure_filename(document_name)
    path = storage.join(experiment_dir, "documents", document_name)
    if folder and folder != "" and not await storage.isdir(path):
        folder = secure_filename(folder)
        path = storage.join(experiment_dir, "documents", folder, document_name)
    else:
        path = storage.join(experiment_dir, "documents", document_name)
    # first check if it is a directory:
    if await storage.isdir(path):
        await storage.rm_tree(path)
    elif await storage.exists(path):
        await storage.rm(path)
    return {"status": "success"}


@router.post("/upload", summary="Upload the contents of a document.")
async def document_upload(experimentId: str, folder: str, files: list[UploadFile]):
    fileNames = []

    # Adding secure filename to the folder name as well
    folder = secure_filename(folder)
    for file in files:
        file_name = secure_filename(file.filename)
        print("uploading filename is: " + str(file_name))
        #
        fileNames.append(file_name)
        # ensure the filename is exactly {dataset_id}_train.jsonl or {dataset_id}_eval.jsonl
        # if not re.match(rf"^{dataset_id}_(train|eval).jsonl$", str(file.filename)):
        #     raise HTTPException(
        #         status_code=403, detail=f"The filenames must be named EXACTLY: {dataset_id}_train.jsonl and {dataset_id}_eval.jsonl")

        print("file content type is: " + str(file.content_type))

        file_ext = os.path.splitext(file_name)[1]
        if file_ext not in allowed_file_types:
            raise HTTPException(
                status_code=403,
                detail=(f'File type "{file_ext}" is not allowed. Allowed file types: {", ".join(allowed_file_types)}'),
            )

        exp_obj = Experiment(experimentId)
        experiment_dir = await exp_obj.get_dir()
        documents_dir = storage.join(experiment_dir, "documents")
        if folder and folder != "":
            folder_path = storage.join(documents_dir, folder)
            if await storage.exists(folder_path):
                documents_dir = folder_path
            else:
                print(f"Creating directory as it doesn't exist: {folder_path}")
                await storage.makedirs(folder_path, exist_ok=True)
                documents_dir = folder_path

        try:
            content = await file.read()
            if not await storage.exists(documents_dir):
                print("Creating directory")
                await storage.makedirs(documents_dir, exist_ok=True)

            newfilename = storage.join(documents_dir, str(file_name))
            async with await storage.open(newfilename, "wb") as out_file:
                await out_file.write(content)
        except Exception as e:
            print(f"Error uploading file: {e}")
            raise HTTPException(status_code=403, detail="There was a problem uploading the file")

    return {"status": "success", "filename": fileNames}


@router.post("/create_folder", summary="Create a new folder.")
async def create_folder(experimentId: str, name: str):
    name = slugify(name)
    # Secure folder name
    name = secure_filename(name)
    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    path = storage.join(experiment_dir, "documents", name)
    print(f"Creating folder {path}")
    if not await storage.exists(path):
        await storage.makedirs(path, exist_ok=True)
    # Object stores (e.g. S3) don't persist empty directories. Create a marker object
    # so empty folders are visible in listings until real files are uploaded.
    marker_path = storage.join(path, FOLDER_MARKER_FILE)
    if not await storage.exists(marker_path):
        async with await storage.open(marker_path, "w", encoding="utf-8") as marker_file:
            await marker_file.write("")
    return {"status": "success"}


@router.post("/download_zip", summary="Download and extract a ZIP file from a URL.")
async def document_download_zip(experimentId: str, data: dict = Body(...)):
    """Download a ZIP file from a URL and extract its contents to the documents folder."""
    url = data.get("url")

    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    # Validate the URL
    if not is_valid_url(url):
        raise HTTPException(status_code=400, detail="Invalid or unauthorized URL")

    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    documents_dir = storage.join(experiment_dir, "documents")

    try:
        # Download ZIP file
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()

            # Save to temporary file and extract
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as temp_zip:
                temp_zip.write(response.content)
                temp_zip_path = temp_zip.name

        # Extract ZIP file
        with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
            zip_ref.extractall(documents_dir)
            extracted_files = [f for f in zip_ref.namelist() if not f.endswith("/") and not f.startswith(".")]

        # Clean up
        os.remove(temp_zip_path)

        return {"status": "success", "extracted_files": extracted_files, "total_files": len(extracted_files)}

    except httpx.HTTPStatusError:
        if "temp_zip_path" in locals() and os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(status_code=400, detail="Failed to download ZIP file: HTTP error.")
    except zipfile.BadZipFile:
        if "temp_zip_path" in locals() and os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(status_code=400, detail="Downloaded file is not a valid ZIP archive")
    except Exception:
        if "temp_zip_path" in locals() and os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(status_code=500, detail="Error processing ZIP file.")
