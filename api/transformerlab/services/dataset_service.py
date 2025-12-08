import os

from datasets import load_dataset
from lab import Dataset


def create_local_dataset(dataset_id, json_data=None):
    # Create a new dataset
    new_dataset = Dataset.create(dataset_id)

    # Take description from json_data if it exists
    description = json_data.get("description", "") if isinstance(json_data, dict) else ""
    new_dataset.set_metadata(
        location="local",
        description=description,
        size=-1,
        json_data=json_data if json_data is not None else {},
    )
    return new_dataset


def load_local_dataset(dataset_dir, data_files=None, streaming=False):
    """
    Load a local dataset, excluding index.json from the data files.
    This prevents accidental ingestion of repository index/metadata files
    that may cause format auto-detection to fail.
    """
    # If caller did not provide explicit data files, enumerate top-level files
    if data_files is None:
        try:
            entries = os.listdir(dataset_dir)
        except Exception:
            entries = []

        filtered_files = []
        for name in entries:
            # Exclude hidden files and common metadata files
            if name in ["index.json"] or name.startswith("."):
                continue
            full_path = os.path.join(dataset_dir, name)
            if os.path.isfile(full_path):
                filtered_files.append(name)

        data_files = filtered_files

    if data_files:
        data_file_paths = [os.path.join(dataset_dir, f) for f in data_files]
        return load_dataset(path=dataset_dir, data_files=data_file_paths, streaming=streaming)
    else:
        # Fall back to default behavior (may fail if only metadata files exist)
        return load_dataset(path=dataset_dir, streaming=streaming)
