"""
MAV (Model Activity Visualizer) Gradio UI for TransformerLab interactive tasks.

This script is embedded (base64) in the interactive-gallery.json entry for mav_gradio
and deployed to /tmp/mav_gradio.py at setup time.  Run it standalone with:

    pip install openmav gradio
    python mav_gradio.py
"""

import gradio as gr
import subprocess
import sys
import re
import os

ANSI = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def run_mav(model: str, prompt: str, max_tokens: int, device: str) -> str:
    env = {**os.environ, "NO_COLOR": "1", "TERM": "dumb", "PYTHONUNBUFFERED": "1"}
    # Prefer the mav entry-point next to the current Python executable so we
    # pick up the env where openmav was just installed.
    python = sys.executable
    mav_script = os.path.join(os.path.dirname(python), "mav")
    if not os.path.exists(mav_script):
        import shutil

        mav_script = shutil.which("mav") or "mav"
    cmd = [
        mav_script,
        "--model", str(model).strip(),
        "--prompt", str(prompt),
        "--max-new-tokens", str(int(max_tokens)),
        "--device", str(device),
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=600, env=env
        )
        raw = result.stdout
        if result.returncode != 0 and result.stderr:
            raw += "\n--- stderr ---\n" + result.stderr
    except subprocess.TimeoutExpired:
        raw = "Error: MAV timed out after 10 minutes."
    except FileNotFoundError:
        raw = (
            "Error: 'mav' command not found.\n"
            "Make sure openmav is installed: pip install openmav"
        )
    except Exception as e:
        raw = f"Error: {e}"
    return ANSI.sub("", raw)


with gr.Blocks(title="MAV - Model Activity Visualizer") as demo:
    gr.Markdown(
        "# MAV - Model Activity Visualizer\n"
        "Run any Hugging Face model and inspect its internals token by token: "
        "attention entropy, MLP activations, and top-k predictions."
    )
    with gr.Row():
        model_inp = gr.Textbox(
            value="gpt2",
            label="Model",
            placeholder="e.g. gpt2, HuggingFaceTB/SmolLM-135M, meta-llama/Llama-3.2-1B",
        )
        prompt_inp = gr.Textbox(value="Once upon a time", label="Prompt")
    with gr.Row():
        tokens_inp = gr.Slider(
            minimum=10, maximum=200, value=50, step=10, label="Max New Tokens"
        )
        device_inp = gr.Dropdown(
            choices=["cpu", "cuda", "mps"], value="cpu", label="Device"
        )
    run_btn = gr.Button("Run MAV Visualization", variant="primary")
    output_box = gr.Textbox(
        label="MAV Output",
        lines=30,
        max_lines=60,
        placeholder="Click 'Run MAV Visualization' to inspect LLM internals...",
    )
    run_btn.click(
        fn=run_mav,
        inputs=[model_inp, prompt_inp, tokens_inp, device_inp],
        outputs=output_box,
    )

demo.launch(server_name="0.0.0.0", server_port=7860)
