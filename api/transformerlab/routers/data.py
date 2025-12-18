import contextlib
import json
from PIL import Image as PILImage
from datasets import load_dataset, load_dataset_builder
from fastapi import APIRouter, HTTPException, UploadFile, Query
import csv
from pydantic import BaseModel
from typing import Dict, Any
from io import BytesIO
import base64
from pathlib import Path
from lab import dirs
from lab import storage
from lab.dataset import Dataset as dataset_service
from datasets.data_files import EmptyDatasetError
from transformerlab.shared.shared import slugify
from transformerlab.shared import galleries
from datasets.exceptions import DatasetNotFoundError
import numpy as np
import wave
from lab.dirs import get_global_log_path


from transformers import AutoTokenizer


from werkzeug.utils import secure_filename

from jinja2 import Environment
from jinja2.sandbox import SandboxedEnvironment
from transformerlab.services import dataset_service as dataset_service_module
import aiofiles


jinja_environment = Environment()
sandboxed_jinja2_environment = SandboxedEnvironment()


async def log(msg):
    global_log_path = await get_global_log_path()
    async with await storage.open(global_log_path, "a") as f:
        await f.write(msg + "\n")


router = APIRouter(prefix="/data", tags=["datasets"])

# Get list of datasets that we have in our hardcoded gallery


class SuccessResponse(BaseModel):
    status: str
    data: Dict[str, Any]


class ErrorResponse(BaseModel):
    status: str
    message: str


@router.get(
    "/gallery",
    summary="Display the datasets available in the dataset gallery.",
    responses={
        200: {
            "model": SuccessResponse,
            "description": "Successful response. Data is a list of column names followed by data, which can be of any datatype.",
        },
        400: {"model": ErrorResponse},
    },
)
async def dataset_gallery() -> Any:
    gallery = await galleries.get_data_gallery()
    # list datasets from filesystem store
    try:
        local_datasets = await dataset_service.list_all()
    except Exception:
        local_datasets = []

    local_dataset_names = set(str(dataset.get("dataset_id")) for dataset in local_datasets)
    for dataset in gallery:
        dataset["downloaded"] = True if dataset["huggingfacerepo"] in local_dataset_names else False
    return {"status": "success", "data": gallery}


@router.get("/info", summary="Fetch the details of a particular dataset.")
async def dataset_info(dataset_id: str):
    # Read from filesystem store
    try:
        d_obj = await dataset_service.get(dataset_id)
        d = await d_obj.get_metadata()
    except FileNotFoundError:
        d = None
    if d is None:
        return {}
    r = {}
    # This means it is a custom dataset the user uploaded
    if d.get("location") == "local":
        try:
            dataset_dir = await dirs.dataset_dir_by_id(dataset_id)
            dataset = await dataset_service_module.load_local_dataset(dataset_dir)
        except EmptyDatasetError:
            return {"status": "error", "message": "The dataset is empty."}
        split = list(dataset.keys())[0]
        r["features"] = dataset[split].features

        # Try the first example in the split
        try:
            sample = dataset[split][0]
        except IndexError:
            sample = {}

        # Determine if the dataset is image-like
        is_image = any(
            getattr(f, "_type", "").lower() == "image"
            or (col in sample and isinstance(sample[col], str) and sample[col].startswith("data:image/"))
            or (col in sample and getattr(type(sample[col]), "__name__", "").lower() == "image")
            for col, f in dataset[split].features.items()
        )

        r["is_image"] = is_image

    else:
        dataset_config = (d.get("json_data") or {}).get("dataset_config", None)
        config_name = (d.get("json_data") or {}).get("config_name", None)
        if dataset_config is not None:
            ds_builder = load_dataset_builder(dataset_id, dataset_config, trust_remote_code=True)
        elif config_name is not None:
            ds_builder = load_dataset_builder(path=dataset_id, name=config_name, trust_remote_code=True)
        else:
            ds_builder = load_dataset_builder(dataset_id, trust_remote_code=True)
        r = {
            "description": ds_builder.info.description,
            "features": ds_builder.info.features,
            "dataset_size": ds_builder.info.dataset_size,
            "download_size": ds_builder.info.download_size,
            "citation": ds_builder.info.citation,
            "homepage": ds_builder.info.homepage,
            "license": ds_builder.info.license,
            "splits": ds_builder.info.splits,
            "supervised_keys": ds_builder.info.supervised_keys,
            "version": ds_builder.info.version,
        }
    return r


@router.get(
    "/preview",
    summary="Preview the contents of a dataset.",
    responses={
        200: {
            "model": SuccessResponse,
            "description": "Successful response. Data is a list of column names followed by data, which can be of any datatype.",
        },
        400: {"model": ErrorResponse},
    },
)
async def dataset_preview(
    dataset_id: str = Query(
        description="The ID of the dataset to preview. This can be a HuggingFace dataset ID or a local dataset ID."
    ),
    offset: int = Query(0, description="The starting index from where to fetch the data.", ge=0),
    split: str = Query(None, description="The split to preview. This can be train, test, or validation."),
    limit: int = Query(10, description="The maximum number of data items to fetch.", ge=1, le=1000),
    streaming: bool = False,
) -> Any:
    # Read from filesystem store
    try:
        d_obj = await dataset_service.get(dataset_id)
        d = await d_obj.get_metadata()
    except FileNotFoundError:
        d = None
    dataset_len = 0
    result = {}

    try:
        if d.get("location") == "local":
            dataset_dir = await dirs.dataset_dir_by_id(dataset_id)
            dataset = await dataset_service_module.load_local_dataset(dataset_dir, streaming=streaming)
        else:
            dataset_config = (d.get("json_data") or {}).get("dataset_config", None)
            config_name = (d.get("json_data") or {}).get("config_name", None)
            if dataset_config is not None:
                dataset = load_dataset(dataset_id, dataset_config, trust_remote_code=True, streaming=streaming)
            elif config_name is not None:
                dataset = load_dataset(path=dataset_id, name=config_name, trust_remote_code=True, streaming=streaming)
            else:
                dataset = load_dataset(dataset_id, trust_remote_code=True, streaming=streaming)
    except Exception as e:
        print(f"Exception occurred: {type(e).__name__}: {e}")
        return {"status": "error", "message": "An internal error has occurred."}

    if split is None or split == "":
        splits = list(dataset.keys())
        if len(splits) == 0:
            return {"status": "error", "message": "No splits available in the dataset."}
        split = splits[0]

    if streaming:
        dataset_len = -1
        dataset = dataset[split].skip(offset)
        rows = list(dataset.take(limit))
        # Serialize rows
        result["rows"] = [serialize_row(row) for row in rows]
        result["splits"] = None
    else:
        if d["location"] != "local" and split not in dataset.keys():
            return {"status": "error", "message": f"Split '{split}' does not exist in the dataset."}
        dataset_len = len(dataset[split])
        columns = dataset[split][offset : min(offset + limit, dataset_len)]
        # Serialize each value in the columns dict, preserving the columnar format
        if isinstance(columns, dict):
            result["columns"] = {k: [serialize_row(v) for v in vals] for k, vals in columns.items()}
        else:
            result["columns"] = columns
        result["splits"] = list(dataset.keys())

    result["len"] = dataset_len
    return {"status": "success", "data": result}


def serialize_row(row):
    """Convert PIL Images and audio arrays in a row to base64 strings, preserving original structure."""
    if isinstance(row, dict):
        # Check if this is an audio object
        if "sampling_rate" in row and "array" in row and "path" in row:
            # This is an audio object, serialize it
            return serialize_audio_object(row)
        return {k: serialize_row(v) for k, v in row.items()}
    elif isinstance(row, list):
        return [serialize_row(v) for v in row]
    elif isinstance(row, PILImage.Image):
        buffered = BytesIO()
        row.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{img_str}"
    elif isinstance(row, np.ndarray):
        # Handle standalone numpy arrays (could be audio)
        return serialize_audio_array(row)
    else:
        return row


def serialize_audio_object(audio_obj):
    """Serialize an audio object to a format suitable for frontend display."""
    audio_data = audio_obj
    array = audio_data["array"]
    sampling_rate = audio_data["sampling_rate"]
    path = audio_data.get("path", "unknown")

    # Convert numpy array to WAV format
    wav_data = convert_audio_array_to_wav(array, sampling_rate)

    # Create base64 data URL
    wav_b64 = base64.b64encode(wav_data).decode("utf-8")
    audio_data_url = f"data:audio/wav;base64,{wav_b64}"

    # Calculate duration
    duration = len(array) / sampling_rate if sampling_rate > 0 else 0

    return {
        "audio_data_url": audio_data_url,
        "metadata": {
            "path": path,
            "sampling_rate": sampling_rate,
            "duration": round(duration, 2),
            "samples": len(array),
            "format": "wav",
        },
    }


def serialize_audio_array(array):
    """Serialize a standalone numpy audio array."""
    # Assume 16kHz sampling rate for standalone arrays
    sampling_rate = 16000
    wav_data = convert_audio_array_to_wav(array, sampling_rate)
    wav_b64 = base64.b64encode(wav_data).decode("utf-8")
    audio_data_url = f"data:audio/wav;base64,{wav_b64}"

    duration = len(array) / sampling_rate if sampling_rate > 0 else 0

    return {
        "audio_data_url": audio_data_url,
        "metadata": {
            "sampling_rate": sampling_rate,
            "duration": round(duration, 2),
            "samples": len(array),
            "format": "wav",
        },
    }


def convert_audio_array_to_wav(array, sampling_rate):
    """Convert a numpy audio array to WAV format bytes."""
    # Normalize audio to 16-bit range
    if array.dtype != np.int16:
        # Convert to float if not already
        if array.dtype != np.float32 and array.dtype != np.float64:
            array = array.astype(np.float32)

        # Normalize to [-1, 1] range
        if array.max() > 1.0 or array.min() < -1.0:
            array = array / max(abs(array.max()), abs(array.min()))

        # Convert to 16-bit integers
        array = (array * 32767).astype(np.int16)

    # Create WAV file in memory
    wav_buffer = BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sampling_rate)
        wav_file.writeframes(array.tobytes())

    return wav_buffer.getvalue()


async def load_and_slice_dataset(dataset_id: str, offset: int, limit: int):
    try:
        d_obj = await dataset_service.get(dataset_id)
        d = await d_obj.get_metadata()
    except FileNotFoundError:
        d = None
    dataset_len = 0
    result = {}
    # This means it is a custom dataset the user uploaded
    if d and d.get("location") == "local":
        try:
            dataset_dir = await dirs.dataset_dir_by_id(dataset_id)
            dataset = await dataset_service_module.load_local_dataset(dataset_dir)
        except Exception as e:
            print(f"Error loading dataset: {type(e).__name__}: {e}")
            return {"status": "error", "message": "An internal error has occurred."}
        dataset_len = len(dataset["train"])
        result["columns"] = dataset["train"][offset : min(offset + limit, dataset_len)]
    else:
        dataset_config = (d.get("json_data") or {}).get("dataset_config", None) if d else None
        config_name = (d.get("json_data") or {}).get("config_name", None) if d else None
        if dataset_config is not None:
            dataset = load_dataset(dataset_id, dataset_config, trust_remote_code=True)
        elif config_name is not None:
            dataset = load_dataset(path=dataset_id, name=config_name, trust_remote_code=True)
        else:
            dataset = load_dataset(dataset_id, trust_remote_code=True)
        dataset_len = len(dataset["train"])
        result["columns"] = dataset["train"][offset : min(offset + limit, dataset_len)]
    result["len"] = dataset_len
    return result, dataset_len


@router.get(
    "/preview_with_template",
    summary="Preview the contents of a dataset after applying a jinja template to it.",
    responses={
        200: {
            "model": SuccessResponse,
            "description": "Successful response. Data is a list of column names followed by data, which can be of any datatype.",
        },
        400: {"model": ErrorResponse},
    },
)
async def dataset_preview_with_template(
    dataset_id: str = Query(
        description="The ID of the dataset to preview. This can be a HuggingFace dataset ID or a local dataset ID."
    ),
    template: str = "",
    offset: int = Query(0, description="The starting index from where to fetch the data.", ge=0),
    limit: int = Query(10, description="The maximum number of data items to fetch.", ge=1, le=1000),
) -> Any:
    result, dataset_len = await load_and_slice_dataset(dataset_id, offset, limit)
    column_names = list(result["columns"].keys())

    jinja_template = sandboxed_jinja2_environment.from_string(template)

    rows = []
    # now iterate over all columns and rows, do not use offset or len because we've already
    # sliced the dataset
    for i in range(0, len(result["columns"][column_names[0]])):
        row = {}
        row["__index__"] = i + offset
        for key in result["columns"].keys():
            row[key] = serialize_row(result["columns"][key][i])

        # Apply the template to a new key in row called __formatted__
        row["__formatted__"] = jinja_template.render(row)
        # row['__template__'] = template
        rows.append(row)

    return {
        "status": "success",
        "data": {"columns": column_names, "rows": rows, "len": dataset_len, "offset": offset, "limit": limit},
    }


@router.get(
    "/preview_with_chat_template",
    summary="Preview the contents of a dataset after applying a jinja chat template to it.",
    responses={
        200: {
            "model": SuccessResponse,
            "description": "Successful response. Data is a list of column names followed by data, which can be of any datatype.",
        },
        400: {"model": ErrorResponse},
    },
)
async def dataset_preview_with_chat_template(
    model_name: str = Query(...),
    chat_column: str = Query(...),
    dataset_id: str = Query(
        description="The ID of the dataset to preview. This can be a HuggingFace dataset ID or a local dataset ID."
    ),
    template: str = "",
    offset: int = Query(0, description="The starting index from where to fetch the data.", ge=0),
    limit: int = Query(10, description="The maximum number of data items to fetch.", ge=1, le=1000),
) -> Any:
    result, dataset_len = await load_and_slice_dataset(dataset_id, offset, limit)
    column_names = list(result["columns"].keys())

    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)

    rows = []
    # now iterate over all columns and rows, do not use offset or len because we've already
    # sliced the dataset
    for i in range(0, len(result["columns"][column_names[0]])):
        row = {}
        row["__index__"] = i + offset
        for key in result["columns"].keys():
            row[key] = serialize_row(result["columns"][key][i])

        try:
            row["__formatted__"] = tokenizer.apply_chat_template(
                row[chat_column],
                tokenize=False,
            )
        except Exception:
            return {
                "status": "error",
                "message": (
                    f"Chat template could not be applied.\nThe selected column '{chat_column}' "
                    "must contain a list of dictionaries with 'role' and 'content' keys. \n"
                    f"Example: [{{'role': 'user', 'content': 'Hi'}}]."
                ),
            }
        rows.append(row)

    return {
        "status": "success",
        "data": {"columns": column_names, "rows": rows, "len": dataset_len, "offset": offset, "limit": limit},
    }


@router.get(
    "/edit_with_template",
    summary="Preview and edit dataset with template, loading from metadata files and local images.",
)
async def dataset_edit_with_template(
    dataset_id: str = Query(..., description="Dataset ID"),
    template: str = Query("", description="Optional Jinja template"),
    offset: int = Query(0, ge=0, description="Starting index"),
    limit: int = Query(10, ge=1, le=1000, description="Max items to fetch"),
):
    dataset_dir = await dirs.dataset_dir_by_id(slugify(dataset_id))
    if not await storage.exists(dataset_dir):
        return {"status": "error", "message": "Dataset directory not found"}

    rows = []
    index = 0

    async for root, _, files in storage.walk(dataset_dir):
        for file in files:
            if file.lower().endswith((".json", ".jsonl", ".csv")):
                # Convert root to string for storage.open
                metadata_path = storage.join(root, file)
                try:
                    if file.endswith(".jsonl"):
                        async with await storage.open(metadata_path, "r", encoding="utf-8") as f:
                            content = await f.read()
                            data = [json.loads(line) for line in content.splitlines()]
                    elif file.endswith(".json"):
                        async with await storage.open(metadata_path, "r", encoding="utf-8") as f:
                            content = await f.read()
                            data = json.loads(content)
                            if isinstance(data, dict):
                                data = [data]
                    elif file.endswith(".csv"):
                        async with await storage.open(metadata_path, "r", encoding="utf-8") as f:
                            content = await f.read()
                            reader = csv.DictReader(content.splitlines())
                            data = [row for row in reader]
                    else:
                        continue
                except Exception as e:
                    print(f"Failed to read metadata from {metadata_path}: {e}")
                    return {"status": "error", "message": "Failed to read metadata file!"}

                for entry in data:
                    split = entry.get("split")
                    if not split:
                        # Parse path parts from storage URI
                        path_parts = storage.join(root, "").rstrip("/").split("/")
                        split = next(
                            (part for part in reversed(path_parts) if part.lower() in ("train", "test", "valid")),
                            "train",
                        )

                    image_rel_path = entry.get("file_name")
                    if not image_rel_path:
                        continue

                    # For images, we still need to use local paths with PIL
                    image_path = storage.join(root, image_rel_path)
                    if not image_path.startswith(str(dataset_dir)):
                        continue

                    # Use storage.exists for check, but PIL.open for actual image reading
                    if not await storage.exists(image_path):
                        await log(f"Image not found: {image_path}")
                        continue

                    try:
                        # For PIL, we need a local file, not a storage URI
                        # Download to temp if needed or use PIL directly with storage
                        async with await storage.open(image_path, "rb") as f:
                            img_bytes = await f.read()
                        img = PILImage.open(BytesIO(img_bytes))
                        buffer = BytesIO()
                        img.save(buffer, format="JPEG")
                        encoded_img = base64.b64encode(buffer.getvalue()).decode("utf-8")
                        image_data_url = f"data:image/jpeg;base64,{encoded_img}"
                        img.close()
                    except Exception as e:
                        print(f"Failed to process image {image_path}: {e}")
                        return {"status": "error", "message": "Failed to process images!"}

                    row = dict(entry)  # Start with all metadata fields
                    row["file_name"] = str(image_rel_path)
                    row["split"] = split
                    row["image"] = image_data_url

                    if template:
                        try:
                            jinja_template = sandboxed_jinja2_environment.from_string(template)
                            row["__formatted__"] = jinja_template.render(row)
                        except Exception as e:
                            row["__formatted__"] = f"Template Error: {e}"

                    rows.append(row)
                    index += 1

                    if len(rows) >= offset + limit:
                        break
        if len(rows) >= offset + limit:
            break

    paginated_rows = rows[offset : offset + limit]
    column_names = list(paginated_rows[0].keys()) if paginated_rows else []

    return {
        "status": "success",
        "data": {
            "columns": column_names,
            "rows": paginated_rows,
            "len": len(rows),
            "offset": offset,
            "limit": limit,
        },
    }


@router.post(
    "/save_metadata",
    summary="Save edited metadata and create a new dataset with reorganized files and updated metadata.",
)
async def save_metadata(dataset_id: str, new_dataset_id: str, file: UploadFile):
    old_dataset_dir = await dirs.dataset_dir_by_id(slugify(dataset_id))
    if not await storage.exists(old_dataset_dir):
        return {"status": "error", "message": "Source dataset not found"}

    new_dataset_id = slugify(new_dataset_id)
    new_dataset_dir = await dirs.dataset_dir_by_id(new_dataset_id)

    if await storage.exists(new_dataset_dir):
        return {"status": "error", "message": "New dataset already exists"}

    await storage.makedirs(new_dataset_dir, exist_ok=True)

    # Read updates
    updates_raw = await file.read()
    try:
        updates = json.loads(updates_raw.decode("utf-8"))
    except Exception as e:
        print(f"Invalid JSON file: {e}")
        return {"status": "error", "message": "Invalid JSON file!"}

    # Scan source metadata
    source_map = {}
    async for root, _, files in storage.walk(old_dataset_dir):
        for f in files:
            if f.lower().endswith((".json", ".jsonl", ".csv")):
                metadata_path = storage.join(root, f)
                try:
                    if f.endswith(".jsonl"):
                        async with await storage.open(metadata_path, "r", encoding="utf-8") as meta_file:
                            content = await meta_file.read()
                            data = [json.loads(line) for line in content.splitlines()]
                    elif f.endswith(".json"):
                        async with await storage.open(metadata_path, "r", encoding="utf-8") as meta_file:
                            content = await meta_file.read()
                            data = json.loads(content)
                            if isinstance(data, dict):
                                data = [data]
                    elif f.endswith(".csv"):
                        async with await storage.open(metadata_path, "r", encoding="utf-8") as meta_file:
                            content = await meta_file.read()
                            reader = csv.DictReader(content.splitlines())
                            data = [row for row in reader]
                    else:
                        continue

                    for entry in data:
                        file_name = entry.get("file_name")
                        if not file_name:
                            continue
                        split = entry.get("split")
                        if not split:
                            path_parts = storage.join(root, "").rstrip("/").split("/")
                            split = next(
                                (p for p in reversed(path_parts) if p.lower() in ("train", "test", "valid")), "train"
                            )
                        label = entry.get("label", "")
                        key = file_name
                        source_map[key] = {
                            "file_name": file_name,
                            "split": split,
                            "label": label,
                            "metadata_root": root,
                        }
                except Exception as e:
                    print(f"Error reading metadata {metadata_path}: {e}")
                    return {"status": "error", "message": "Failed to read metadata!"}

    metadata_accumulator = {}
    all_columns = set()

    for row in updates:
        file_name = row.get("file_name")
        final_split = row.get("split", "")
        final_label = row.get("label", "")
        if final_split not in ["train", "test", "valid"]:
            final_split = "train"

        source_info = source_map.get(file_name)
        if not source_info:
            await log(f"Warning: Source info not found for {file_name}, skipping")
            continue

        source_path = storage.join(source_info["metadata_root"], file_name)
        if not await storage.exists(source_path):
            await log(f"Warning: Source image file not found {source_path}, skipping")
            continue

        if final_label == "":
            dest_folder = storage.join(new_dataset_dir, final_split)
        else:
            dest_folder = storage.join(new_dataset_dir, final_split, final_label)
        await storage.makedirs(dest_folder, exist_ok=True)
        # Get just the filename for dest
        file_basename = Path(file_name).name
        dest_path = storage.join(dest_folder, file_basename)

        try:
            await storage.copy_file(source_path, dest_path)
        except Exception as e:
            print(f"Failed to copy {source_path} to {dest_path}: {e}")
            return {"status": "error", "message": "Failed to copy from source to destination"}

        # Prepare metadata entry
        metadata_entry = {}
        for k, v in row.items():
            if k in {"__index__", "__formatted__", "split"}:
                continue
            if k == "file_name":
                metadata_entry[k] = Path(file_name).name
                all_columns.add("file_name")
            elif v not in [None, "", [], {}]:
                metadata_entry[k] = v
                all_columns.add(k)

        key = (final_split, final_label)
        metadata_accumulator.setdefault(key, []).append(metadata_entry)

    for (split, label), entries in metadata_accumulator.items():
        folder = storage.join(new_dataset_dir, split, label)
        metadata_file = storage.join(folder, "metadata.jsonl")
        try:
            async with await storage.open(metadata_file, "w", encoding="utf-8") as f:
                for entry in entries:
                    full_entry = {col: entry.get(col, "") for col in all_columns}
                    await f.write(json.dumps(full_entry) + "\n")
        except Exception as e:
            print(f"Failed to write metadata file {metadata_file}: {e}")
            return {"status": "error", "message": "Failed to write metadata file!"}

    result = await dataset_new(dataset_id=new_dataset_id, generated=False)
    if result.get("status") != "success":
        return {"status": "error", "message": "Failed to register new dataset"}

    return {
        "status": "success",
        "message": f"Dataset '{new_dataset_id}' created with updated metadata and files",
        "dataset_id": new_dataset_id,
    }


@router.get("/download", summary="Download a dataset from the HuggingFace Hub to the LLMLab server.")
async def dataset_download(dataset_id: str, config_name: str = None):
    # Ensure we don't already have this dataset in filesystem store
    try:
        _ = await dataset_service.get(dataset_id)
        return {"status": "error", "message": f"A dataset with the name {dataset_id} already exists"}
    except FileNotFoundError:
        pass

    # Try to get the dataset info from the gallery
    gallery = []
    json_data = {}
    gallery = await galleries.get_data_gallery()
    for dataset in gallery:
        if dataset["huggingfacerepo"] == dataset_id:
            json_data = dataset

    try:
        dataset_config = json_data.get("dataset_config", None)
        config_name = json_data.get("config_name", config_name)
        if dataset_config is not None:
            ds_builder = load_dataset_builder(dataset_id, dataset_config, trust_remote_code=True)
        elif config_name is not None:
            ds_builder = load_dataset_builder(path=dataset_id, name=config_name, trust_remote_code=True)
        else:
            ds_builder = load_dataset_builder(dataset_id, trust_remote_code=True)
        await log(f"Dataset builder loaded for dataset_id: {dataset_id}")

    except ValueError as e:
        await log(f"ValueError occurred: {type(e).__name__}: {e}")
        if "Config name is missing" in str(e):
            return {"status": "error", "message": "Please enter the folder_name of the dataset from huggingface"}
        else:
            return {"status": "error", "message": "An internal error has occurred!"}

    except DatasetNotFoundError as e:
        await log(f"DatasetNotFoundError occurred: {e}")
        return {
            "status": "error",
            "message": f"Dataset '{dataset_id}' not found or is private. Please check the dataset ID.",
        }

    except Exception as e:
        await log(f"Exception occurred: {type(e).__name__}: {e}")
        return {"status": "error", "message": "An internal error has occurred!"}

    dataset_size = ds_builder.info.download_size
    if not dataset_size:
        dataset_size = -1

    if json_data == {}:
        json_data = {
            "name": ds_builder.info.dataset_name,
            "huggingfacerepo": dataset_id,
            "config_name": config_name,
            "description": ds_builder.info.description,
            "dataset_size": dataset_size,
            "citation": ds_builder.info.citation,
            "homepage": ds_builder.info.homepage,
            "license": ds_builder.info.license,
            "version": str(ds_builder.info.version),
        }

    # Create filesystem metadata
    try:
        try:
            sdk_ds = await dataset_service.get(dataset_id)
        except FileNotFoundError:
            sdk_ds = await dataset_service.create(dataset_id)
        await sdk_ds.set_metadata(
            location="huggingfacehub",
            description=ds_builder.info.description or "",
            size=dataset_size,
            json_data=json_data,
        )
        await log(f"Dataset created in filesystem for dataset_id: {dataset_id}")
    except Exception as e:
        print(f"Failed to write dataset metadata to SDK store: {type(e).__name__}: {e}")

    # Download the dataset
    # Later on we can move this to a job
    async def load_dataset_thread(dataset_id, config_name=None):
        global_log_path = await get_global_log_path()
        async with await storage.open(global_log_path, "a") as logFile:
            flushLogFile = FlushFile(logFile)
            with contextlib.redirect_stdout(flushLogFile), contextlib.redirect_stderr(flushLogFile):
                try:
                    if config_name is not None:
                        dataset = load_dataset(path=dataset_id, name=config_name, trust_remote_code=True)
                    else:
                        dataset = load_dataset(dataset_id, trust_remote_code=True)
                    print(f"Dataset downloaded for dataset_id: {dataset_id}")
                    return dataset

                except ValueError as e:
                    error_msg = f"{type(e).__name__}: {e}"
                    print(error_msg)
                    raise ValueError(e)

                except Exception as e:
                    error_msg = f"{type(e).__name__}: {e}"
                    print(error_msg)
                    raise

    try:
        dataset = await load_dataset_thread(dataset_id, config_name)

    except ValueError as e:
        await log(f"Exception occurred while downloading dataset: {type(e).__name__}: {e}")
        if "Config name is missing" in str(e):
            return {"status": "error", "message": "Please enter the folder_name of the dataset from huggingface"}
        else:
            return {"status": "error", "message": "An internal error has occurred!"}

    except Exception as e:
        await log(f"Exception occurred while downloading dataset: {type(e).__name__}: {e}")
        return {"status": "error", "message": "An internal error has occurred!"}

    return {"status": "success"}


@router.get("/list", summary="List available datasets.")
async def dataset_list(generated: bool = True):
    # Filesystem-only list
    try:
        merged_list = await dataset_service.list_all()
    except Exception:
        merged_list = []

    if generated:
        return merged_list

    final_list = []
    for entry in merged_list:
        entry_json_data = entry.get("json_data", "{}")
        if not isinstance(entry_json_data, dict):
            try:
                json_data = json.loads(entry_json_data)
            except Exception:
                json_data = {}
        else:
            json_data = entry.get("json_data", {})
        if not generated and not json_data.get("generated", False):
            final_list.append(entry)

    return final_list


@router.get("/generated_datasets_list", summary="List available generated datasets.")
async def generated_datasets_list():
    try:
        merged_list = await dataset_service.list_all()
    except Exception:
        merged_list = []
    result = []
    for entry in merged_list:
        entry_json_data = entry.get("json_data", {})
        if not isinstance(entry_json_data, dict):
            try:
                entry_json_data = json.loads(entry_json_data)
            except Exception:
                entry_json_data = {}
        if entry_json_data.get("generated", False):
            result.append(entry)
    return result


@router.get("/new", summary="Create a new dataset.")
async def dataset_new(dataset_id: str, generated: bool = False):
    dataset_id = slugify(dataset_id)

    # Check to make sure we don't have a dataset with this name (filesystem)
    try:
        _ = await dataset_service.get(dataset_id)
        return {"status": "error", "message": f"A dataset with the name {dataset_id} already exists"}
    except FileNotFoundError:
        pass

    # Now make a directory that maps to the above dataset_id
    # Check if the directory already exists
    dataset_path = await dirs.dataset_dir_by_id(dataset_id)
    if not await storage.exists(dataset_path):
        await storage.makedirs(dataset_path, exist_ok=True)
    # Create filesystem metadata
    try:
        ds = await dataset_service.create(dataset_id)
        await ds.set_metadata(
            location="local",
            description="",
            size=-1,
            json_data={"generated": True} if generated else {},
        )
    except Exception as e:
        print(f"Failed to write dataset metadata to SDK store: {type(e).__name__}: {e}")
    return {"status": "success", "dataset_id": dataset_id}


@router.get("/delete", summary="Delete a dataset.")
async def dataset_delete(dataset_id: str):
    dataset_id = secure_filename(dataset_id)
    # delete directory and contents. ignore_errors because we don't care if the directory doesn't exist
    dataset_dir = await dirs.dataset_dir_by_id(dataset_id)
    await storage.rm_tree(dataset_dir)
    return {"status": "success"}


@router.post("/fileupload", summary="Upload the contents of a dataset.")
async def create_upload_file(dataset_id: str, files: list[UploadFile]):
    dataset_id = slugify(dataset_id)
    uploaded_filenames = []

    for file in files:
        print("uploading filename is: " + str(file.filename))

        # # ensure filename is in the format <something>_train.jsonl or <something>_eval.jsonl
        # if not re.match(r"^.+_(train|eval).jsonl$", str(file.filename)):
        #     raise HTTPException(
        #         status_code=403, detail=f"The filenames must be named EXACTLY: {dataset_id}_train.jsonl and {dataset_id}_eval.jsonl")

        # ensure the filename is exactly {dataset_id}_train.jsonl or {dataset_id}_eval.jsonl

        # if not re.match(rf"^{dataset_id}_(train|eval).jsonl$", str(file.filename)):
        #     raise HTTPException(
        #         status_code=403, detail=f"The filenames must be named EXACTLY: {dataset_id}_train.jsonl and {dataset_id}_eval.jsonl")

        try:
            content = await file.read()
            dataset_dir = await dirs.dataset_dir_by_id(dataset_id)
            target_path = storage.join(dataset_dir, str(file.filename))
            # aiofiles doesn't support URIs, so we need to use storage.open instead
            await storage.makedirs(dataset_dir, exist_ok=True)
            async with await storage.open(target_path, "wb") as out_file:
                await out_file.write(content)
            uploaded_filenames.append(str(file.filename))
        except Exception:
            raise HTTPException(status_code=403, detail="There was a problem uploading the file")

    # Update dataset metadata with uploaded files
    if uploaded_filenames:
        try:
            ds = await dataset_service.get(dataset_id)
            current_data = await ds.get_metadata()
            json_data = current_data.get("json_data", {})
            # Add files list if not present or merge with existing
            existing_files = json_data.get("files", [])
            if isinstance(existing_files, list):
                all_files = list(set(existing_files + uploaded_filenames))
            else:
                all_files = uploaded_filenames
            json_data["files"] = all_files
            await ds.set_metadata(json_data=json_data)
        except Exception as e:
            print(f"Failed to update dataset metadata with files: {type(e).__name__}: {e}")

    return {"status": "success"}


class FlushFile:
    def __init__(self, file):
        self.file = file

    def write(self, data):
        self.file.write(data)
        self.file.flush()

    def flush(self):
        self.file.flush()
