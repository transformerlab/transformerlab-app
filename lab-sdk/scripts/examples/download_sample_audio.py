import os
from pathlib import Path
from urllib.request import urlretrieve

from lab import lab


def download_sample_audio() -> str:
    """
    Download and save a small sample audio file for testing artifact previews.

    This can be run directly, or used from a job script that then calls
    lab.save_artifact on the returned path.
    """

    # Simple, freely-usable test audio file (small ~few KB WAV tone)
    url = "https://file-examples.com/wp-content/storage/2017/11/file_example_WAV_1MG.wav"

    output_dir = Path(os.getenv("OUTPUT_DIR", "./output_artifacts"))
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / "sample_audio.wav"

    print(f"Downloading sample audio from {url}")
    urlretrieve(url, output_path)  # nosec: B310 - simple demo helper
    print(f"Saved sample audio to: {output_path.resolve()}")

    return str(output_path)


def main() -> None:
    """
    Entry point when running as a Transformer Lab job.

    - Initializes lab
    - Downloads a sample audio file
    - Saves it as a job artifact
    """

    lab.init()
    path = download_sample_audio()
    saved_path = lab.save_artifact(path, name="sample_audio.wav")
    lab.log(f"Saved audio artifact: {saved_path}")
    lab.finish("Sample audio artifact created successfully")


if __name__ == "__main__":
    main()
