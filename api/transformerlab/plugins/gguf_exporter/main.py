# This plugin exports a model to GGUF format so you can interact and train on a MBP with Apple Silicon
import contextlib
import io
import os
import subprocess

from huggingface_hub import snapshot_download

try:
    from transformerlab.plugin import get_python_executable
    from transformerlab.sdk.v1.export import tlab_exporter
except ImportError or ModuleNotFoundError:
    from transformerlab.plugin_sdk.transformerlab.plugin import get_python_executable
    from transformerlab.plugin_sdk.transformerlab.sdk.v1.export import tlab_exporter

from lab import storage

tlab_exporter.add_argument("--output_model_id", type=str, help="Filename for the GGUF model.")
tlab_exporter.add_argument(
    "--outtype",
    default="q8_0",
    type=str,
    help="GGUF output format. q8_0 quantizes the model to 8 bits.",
)


@tlab_exporter.exporter_job_wrapper(progress_start=0, progress_end=100)
def gguf_export():
    """Export a model to GGUF format"""
    input_model = tlab_exporter.params.get("model_name")
    outtype = tlab_exporter.params.get("outtype")
    output_dir = tlab_exporter.params.get("output_dir")

    # Create output file
    storage.makedirs(output_dir, exist_ok=True)

    plugin_dir = os.path.realpath(os.path.dirname(__file__))
    python_executable = get_python_executable(plugin_dir)

    print("Starting GGUF conversion...")
    tlab_exporter.add_job_data("status", "Starting GGUF conversion")

    # The model _should_ be available locally
    # but call hugging_face anyways so we get the proper path to it
    model_path = input_model
    if not os.path.exists(model_path):
        tlab_exporter.add_job_data("status", "Downloading model from Hugging Face")
        tlab_exporter.progress_update(5)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            model_path = snapshot_download(
                repo_id=input_model,
                allow_patterns=[
                    "*.json",
                    "*.safetensors",
                    "*.py",
                    "tokenizer.model",
                    "*.tiktoken",
                ],
            )

    print("Quantizing model to 8-bit format...")
    tlab_exporter.add_job_data("status", "Quantizing model to 8-bit format")
    tlab_exporter.progress_update(8)
    command = [
        python_executable,
        os.path.join(plugin_dir, "llama.cpp", "convert_hf_to_gguf.py"),
        "--outfile",
        output_dir,
        "--outtype",
        outtype,
        model_path,
    ]

    print(f"Running command to convert model to GGUF format: {' '.join(command)}")
    tlab_exporter.add_job_data("command", " ".join(command))
    tlab_exporter.progress_update(10)

    try:
        with subprocess.Popen(
            command,
            cwd=plugin_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1,
        ) as process:
            output_lines = []
            progress_value = 10

            for line in process.stdout:
                line = line.strip()
                output_lines.append(line)
                print(line, flush=True)

                # Detect writing progress
                if line.startswith("Writing:"):
                    import re

                    match = re.search(r"(\d+)%\|", line)
                    if match:
                        writing_percent = int(match.group(1))
                        progress_value = 10 + int(
                            writing_percent * 0.89
                        )  # 0→100 writing becomes 10→99
                        tlab_exporter.progress_update(progress_value)
                        tlab_exporter.add_job_data(
                            "status", f"Writing GGUF file ({writing_percent}%)"
                        )
                    continue

            return_code = process.wait()
            tlab_exporter.add_job_data("stdout", "\n".join(output_lines))

            if return_code != 0:
                error_msg = f"GGUF conversion failed with return code {return_code}"
                print(error_msg)
                tlab_exporter.add_job_data("status", error_msg)
                raise RuntimeError(error_msg)

    except Exception as e:
        error_msg = f"GGUF conversion failed with exception: {e!s}"
        print(error_msg)
        tlab_exporter.add_job_data("status", error_msg)
        raise

    print("GGUF conversion completed successfully!")
    tlab_exporter.add_job_data("status", "GGUF conversion complete")
    tlab_exporter.progress_update(100)

    return "Successful export to GGUF format"


gguf_export()
