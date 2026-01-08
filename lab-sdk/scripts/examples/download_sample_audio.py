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

    # Simple, freely-usable test audio files (small WAV clips)
    # Try multiple URLs so the script is resilient if one host goes down
    urls = [
        # Short 3-second WAV sample
        "https://samplelib.com/lib/preview/wav/sample-3s.wav",
    ]

    output_dir = Path(os.getenv("OUTPUT_DIR", "./output_artifacts"))
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / "sample_audio.wav"

    last_error: Exception | None = None
    for url in urls:
        try:
            print(f"Downloading sample audio from {url}")
            urlretrieve(url, output_path)  # nosec: B310 - simple demo helper
            print(f"Saved sample audio to: {output_path.resolve()}")
            return str(output_path)
        except Exception as e:  # pragma: no cover - network/demo only
            last_error = e
            print(f"Failed to download from {url}: {e}")

    # If we get here, all URLs failed
    raise RuntimeError(f"Failed to download sample audio from all URLs. Last error: {last_error}")


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
