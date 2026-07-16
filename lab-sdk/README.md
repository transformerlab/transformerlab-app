# Transformer Lab SDK

The Transformer Lab Python SDK provides a way for ML scripts to integrate with Transformer Lab.

## Install

```bash
pip install transformerlab
```

## Usage

```
from lab import lab

# Initialize with experiment ID
lab.init("my-experiment")
lab.log("Job initiated")

config_artifact_path = lab.save_artifact(<config_file>, "training_config.json")
lab.log(f"Saved training config: {config_artifact_path}")
lab.update_progress(1)

...
lab.update_progress(99)

model_path = lab.save_model(<training_output_dir>, name="trained_model")
lab.log("Saved model file to {model_path}")

lab.finish("Training completed successfully")
```

## Reporting metrics

Pass a **dict** of named metrics to `lab.finish(score=...)`. The dict shape is required —
metrics are stored under `job_data.score` and surfaced by `lab job list` (Score column)
and `lab job info`, and read by sweep flows for optimization.

```python
lab.finish(message="Done!")                              # success, no score
lab.finish(message="Done!", score={"accuracy": 0.78})    # success with one metric
lab.finish(score={"accuracy": 0.78, "f1": 0.83})         # multiple metrics
```

Do not pass a scalar (e.g. `lab.finish(score=0.78)`) — wrap it in a dict instead:
`lab.finish(score={"score": 0.78})`.

Sample scripts can be found at
https://github.com/transformerlab/transformerlab-app/tree/main/lab-sdk/scripts/examples

## Development

The code for this can be found in the `lab-sdk` directory of
https://github.com/transformerlab/transformerlab-app

To develop locally in editable mode and run automated tests:

```bash
cd lab-sdk
uv venv
uv pip install -e .
uv run pytest  # Run tests
```
