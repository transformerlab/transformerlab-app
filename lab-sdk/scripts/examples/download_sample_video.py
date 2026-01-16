import os
from pathlib import Path
from urllib.request import urlretrieve

from lab import lab


def download_sample_video() -> str:
    """
    Download and save a small sample video file for testing artifact previews.

    This can be run directly, or used from a job script that then calls
    lab.save_artifact on the returned path.
    """

    # Try multiple reliable test video URLs (fallback if one fails)
    urls = [
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    ]

    output_dir = Path(os.getenv("OUTPUT_DIR", "./output_artifacts"))
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / "sample_video.mp4"

    # Try each URL until one works
    last_error = None
    for url in urls:
        try:
            print(f"Downloading sample video from {url}")
            urlretrieve(url, output_path)  # nosec: B310 - simple demo helper
            print(f"Saved sample video to: {output_path.resolve()}")
            return str(output_path)
        except Exception as e:
            last_error = e
            print(f"Failed to download from {url}: {e}")
            continue

    # If all URLs failed, raise the last error
    raise Exception(f"Failed to download sample video from all URLs. Last error: {last_error}")


def main() -> None:
    """
    Entry point when running as a Transformer Lab job.

    - Initializes lab
    - Downloads a sample video file
    - Saves it as a job artifact
    """

    lab.init()
    path = download_sample_video()
    saved_path = lab.save_artifact(path, name="sample_video.mp4")
    lab.log(f"Saved video artifact: {saved_path}")
    lab.finish("Sample video artifact created successfully")


if __name__ == "__main__":
    main()
