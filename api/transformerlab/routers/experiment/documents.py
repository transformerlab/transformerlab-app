import datetime
import os
import tempfile
import zipfile

import aiofiles
import httpx
from fastapi import APIRouter, Body, HTTPException, UploadFile
from fastapi.responses import FileResponse
from markitdown import MarkItDown
from werkzeug.utils import secure_filename
from urllib.parse import urlparse

from transformerlab.routers.experiment import rag
from transformerlab.shared.shared import slugify

from lab import Experiment, storage

router = APIRouter(prefix="/documents", tags=["documents"])

allowed_file_types = [".txt", ".jsonl", ".pdf", ".csv", ".epub", ".ipynb", ".md", ".ppt", ".zip"]

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
        folder = secure_filename(folder)

        if folder and folder != "":
            file_location = storage.join(experiment_dir, "documents", folder, document_name)
        else:
            file_location = storage.join(experiment_dir, "documents", document_name)
        print(f"Returning document from {file_location}")
        # with open(file_location, "r") as f:
        #     file_contents = f.read()
    except FileNotFoundError:
        return "error file not found"
    return FileResponse(file_location)


@router.get("/list", summary="List available documents.")
async def document_list(experimentId: str, folder: str = None):
    documents = []
    tfl_remote_storage_enabled = os.getenv("TFL_REMOTE_STORAGE_ENABLED", "")
    use_detail = not bool(tfl_remote_storage_enabled)  # no size/mtime when remote
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
    md = MarkItDown(enable_plugins=False)
    tfl_api_storage_uri = os.getenv("TFL_REMOTE_STORAGE_ENABLED", "")

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

        restricted_file_type = False

        if file.content_type not in ["text/plain", "application/json", "application/pdf", "application/octet-stream"]:
            restricted_file_type = True
            print("File Type is Restricted from viewing, we will paste it as an md file instead")

            if file.content_type.startswith("image/"):
                raise HTTPException(status_code=403, detail="The file must be a text file, a JSONL file, or a PDF")

        file_ext = os.path.splitext(file_name)[1]
        # if file_ext not in allowed_file_types:
        #     raise HTTPException(status_code=403, detail="The file must be a text file, a JSONL file, or a PDF")

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

        markitdown_dir = storage.join(documents_dir, ".tlab_markitdown")
        if not await storage.exists(markitdown_dir):
            await storage.makedirs(markitdown_dir, exist_ok=True)

        if not restricted_file_type:
            # Save the file to the dataset directory
            try:
                content = await file.read()
                if not await storage.exists(documents_dir):
                    print("Creating directory")
                    await storage.makedirs(documents_dir, exist_ok=True)

                newfilename = storage.join(documents_dir, str(file_name))
                if tfl_api_storage_uri:
                    async with await storage.open(newfilename, "wb") as out_file:
                        await out_file.write(content)
                else:
                    async with aiofiles.open(newfilename, "wb") as out_file:
                        await out_file.write(content)

                # Convert file to .md format using MarkItDown and save it in markitdown_dir (local only)
                # Skip for remote storage, images, and unsupported types
                if not tfl_api_storage_uri and file_ext not in [".jpeg", ".jpg", ".png", ".gif", ".webp"]:
                    try:
                        result = md.convert(newfilename)
                        newfilename_md = storage.join(markitdown_dir, str(file_name).replace(file_ext, ".md"))
                        print(f"Saving converted file to {markitdown_dir}")
                        async with aiofiles.open(newfilename_md, "w", encoding="utf-8") as out_file:
                            await out_file.write(result.markdown)
                    except Exception as e:
                        print(f"Error converting file to .md format: {e}")
            except Exception as e:
                print(f"Error uploading file: {e}")
                raise HTTPException(status_code=403, detail="There was a problem uploading the file")
        else:
            # Restricted file type: when TFL_REMOTE_STORAGE_ENABLED is set, save as-is (no conversion).
            # Otherwise try to convert to .md using MarkItDown for viewing.
            try:
                content = await file.read()
                if tfl_api_storage_uri:
                    # Save file as-is without conversion (e.g. task.yaml, application/x-yaml)
                    newfilename = storage.join(documents_dir, str(file_name))
                    async with await storage.open(newfilename, "wb") as out_file:
                        await out_file.write(content)
                else:
                    temp_file_path = None
                    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                        temp_file.write(content)
                        temp_file_path = temp_file.name
                    try:
                        result = md.convert(temp_file_path)
                        newfilename = storage.join(documents_dir, str(file_name).replace(file_ext, ".md"))
                        newfilename_md = storage.join(markitdown_dir, str(file_name).replace(file_ext, ".md"))
                        async with aiofiles.open(newfilename, "w", encoding="utf-8") as out_file:
                            await out_file.write(result.markdown)
                        async with aiofiles.open(newfilename_md, "w", encoding="utf-8") as out_file:
                            await out_file.write(result.markdown)
                    finally:
                        if temp_file_path and os.path.exists(temp_file_path):
                            os.remove(temp_file_path)
            except Exception as e:
                print(f"Error converting file to .md format: {e}")
                raise HTTPException(status_code=403, detail="There was a problem uploading the file")

        # reindex the vector store on every file upload
        if folder == "rag":
            await rag.reindex(experimentId)

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
    return {"status": "success"}


@router.post("/upload_links", summary="Upload the contents from the provided web links.")
async def document_upload_links(experimentId: str, folder: str = None, data: dict = Body(...)):
    urls = data.get("urls")
    folder = secure_filename(folder)
    tfl_api_storage_uri = os.getenv("TFL_REMOTE_STORAGE_ENABLED", "")
    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    documents_dir = storage.join(experiment_dir, "documents")
    if folder and folder != "":
        folder_path = storage.join(documents_dir, folder)
        if await storage.exists(folder_path):
            documents_dir = folder_path
        else:
            return {"status": "error", "message": f'Folder "{folder}" not found'}

    markitdown_dir = storage.join(documents_dir, ".tlab_markitdown")

    if not await storage.exists(markitdown_dir):
        await storage.makedirs(markitdown_dir, exist_ok=True)

    # Find the next available number for link_X.md files
    existing_numbers = set()
    if await storage.exists(documents_dir):
        try:
            entries = await storage.ls(documents_dir, detail=False)
            for entry in entries:
                name = os.path.basename(entry.rstrip("/"))
                if name.startswith("link_") and name.endswith(".md"):
                    try:
                        # Extract number from "link_X.md"
                        num_str = name[5:-3]  # Remove "link_" prefix and ".md" suffix
                        existing_numbers.add(int(num_str))
                    except ValueError:
                        pass  # Skip if not a valid number
        except Exception:
            pass  # If listing fails, start from 1

    # Find the starting number (next available)
    next_number = 1
    if existing_numbers:
        next_number = max(existing_numbers) + 1

    md = MarkItDown(enable_plugins=False)
    for i, url in enumerate(urls):
        result = md.convert(url)
        file_number = next_number + i
        filename = storage.join(documents_dir, f"link_{file_number}.md")
        filename_md = storage.join(markitdown_dir, f"link_{file_number}.md")
        if tfl_api_storage_uri:
            async with await storage.open(filename, "w", encoding="utf-8") as out_file:
                await out_file.write(result.markdown)
            async with await storage.open(filename_md, "w", encoding="utf-8") as out_file:
                await out_file.write(result.markdown)
        else:
            async with aiofiles.open(filename, "w", encoding="utf-8") as out_file:
                await out_file.write(result.markdown)
            async with aiofiles.open(filename_md, "w", encoding="utf-8") as out_file:
                await out_file.write(result.markdown)
        # reindex the vector store on every file upload
        if folder == "rag":
            await rag.reindex(experimentId)
    return {"status": "success", "filename": urls}


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

        # Reindex RAG if any files were extracted to a 'rag' folder
        rag_files = [f for f in extracted_files if f.startswith("rag/")]
        if rag_files:
            await rag.reindex(experimentId)

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
