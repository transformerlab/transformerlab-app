from lab import Dataset
from lab import storage
import os
import json
from datasets import load_dataset, load_from_disk, Dataset as HFDataset, DatasetDict


def create_local_dataset(dataset_id, json_data=None):
    # Create a new dataset
    new_dataset = Dataset.create(dataset_id)

    # Take description from json_data if it exists
    description = json_data.get("description", "") if isinstance(json_data, dict) else ""
    new_dataset.set_metadata(
        location="local", description=description, size=-1, json_data=json_data if json_data is not None else {}
    )
    return new_dataset


def load_local_dataset(dataset_dir, data_files=None, streaming=False):
    """
    Load a local dataset, excluding index.json from the data files.
    This prevents accidental ingestion of repository index/metadata files
    that may cause format auto-detection to fail.

    Works with both local filesystem paths and remote storage paths (S3, GCS, etc.).
    For remote paths (s3://, gs://, etc.), uses load_from_disk which handles remote storage better.
    """
    # Check if this is a remote storage path
    is_remote = dataset_dir.startswith(("s3://", "gs://", "abfs://", "gcs://"))

    # For remote paths, try load_from_disk first (works better with datasets saved via save_to_disk)
    if is_remote:
        try:
            # load_from_disk doesn't support streaming parameter
            dataset = load_from_disk(dataset_dir, storage_options={"profile": "transformerlab-s3"})
            # If streaming was requested, we can't use load_from_disk, so fall through
            if streaming:
                raise ValueError("streaming not supported with load_from_disk")
            return dataset
        except Exception as e:
            # If load_from_disk fails, fall back to load_dataset approach
            print(f"load_from_disk failed for {dataset_dir}, falling back to load_dataset: {e}")

    # If caller did not provide explicit data files, enumerate top-level files
    if data_files is None:
        try:
            # Use storage.ls() which works with both local and remote (S3) paths
            entries = storage.ls(dataset_dir, detail=False)
        except Exception:
            entries = []

        filtered_files = []
        for entry_path in entries:
            # storage.ls() returns full paths, so extract just the basename
            # Handle both local paths and remote URIs (s3://, gs://, etc.)
            if "/" in entry_path:
                name = entry_path.rstrip("/").split("/")[-1]
            elif "\\" in entry_path:
                name = os.path.basename(entry_path)
            else:
                name = entry_path

            # Exclude hidden files and common metadata files
            if name in ["index.json"] or name.startswith("."):
                continue

            # Check if it's a file (entry_path is already the full path from storage.ls)
            if storage.isfile(entry_path):
                filtered_files.append(name)

        data_files = filtered_files

    if data_files:
        # Use storage.join() which works with both local and remote paths
        data_file_paths = [storage.join(dataset_dir, f) for f in data_files]
        # For remote paths with JSON files, load_dataset may not work correctly
        # So we'll read the JSON files directly and create a dataset
        if is_remote:
            try:
                # Read JSON files from remote storage and create dataset
                all_data = []
                for json_file_path in data_file_paths:
                    with storage.open(json_file_path, "r", encoding="utf-8") as f:
                        if json_file_path.endswith(".jsonl"):
                            # JSONL format (one JSON object per line)
                            for line in f:
                                line = line.strip()
                                if line:
                                    all_data.append(json.loads(line))
                        else:
                            # Regular JSON format
                            file_data = json.load(f)
                            if isinstance(file_data, list):
                                all_data.extend(file_data)
                            elif isinstance(file_data, dict):
                                all_data.append(file_data)

                # Create dataset from the loaded data
                # Wrap in DatasetDict with "train" split to match expected format
                dataset = HFDataset.from_list(all_data)
                return DatasetDict({"train": dataset})
            except Exception as e:
                # If direct reading fails, try load_dataset as fallback
                print(f"Direct JSON reading failed for remote path, trying load_dataset: {e}")
                return load_dataset(path=dataset_dir, data_files=data_file_paths, streaming=streaming)
        else:
            return load_dataset(path=dataset_dir, data_files=data_file_paths, streaming=streaming)
    else:
        # Fall back to default behavior (may fail if only metadata files exist)
        # For remote paths, load_dataset should handle S3 URIs directly
        return load_dataset(path=dataset_dir, streaming=streaming)
