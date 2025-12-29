import io
import zipfile
from typing import List


def create_zip_from_storage(file_paths: List[str], storage) -> io.BytesIO:
    """
    Create a zip file in an in-memory buffer from a list of storage file paths.

    Args:
        file_paths: List of absolute file paths to include in the zip.
        storage: The storage backend to use for reading files.

    Returns:
        io.BytesIO: Buffer containing the zip file data.
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in file_paths:
            try:
                # Determine a relative name for the file inside the zip
                # If it looks like a path, take the basename
                filename = file_path.split("/")[-1] if "/" in file_path else file_path

                # Check if file exists to avoid errors
                if not storage.exists(file_path):
                    print(f"File not found during zipping: {file_path}")
                    continue

                if not storage.isfile(file_path):
                    # Skip directories
                    continue

                # Read file content from storage
                with storage.open(file_path, "rb") as f:
                    file_content = f.read()
                    zip_file.writestr(filename, file_content)
            except Exception as e:
                print(f"Error adding file {file_path} to zip: {e}")
                # Continue with other files even if one fails
                continue

    zip_buffer.seek(0)
    return zip_buffer
