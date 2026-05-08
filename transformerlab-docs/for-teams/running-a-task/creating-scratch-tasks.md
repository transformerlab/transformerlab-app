---
title: Creating Tasks From Scratch
sidebar_position: 8
---

This guide explains how to create a task from scratch, how task files appear on the compute machine, and how to modify your training scripts so that important outputs are available later in the GUI.

It covers:

- **Creating a task from a GitHub repository**
- **Creating a task from a local directory**
- **Understanding where files are mounted inside the job environment**
- **Using `lab.save_artifact` so files show up in the UI**

## Creating a Task From a GitHub Repository

When you create a task from a GitHub repo, Transformer Lab clones your code into the job environment and runs whatever command you configure (for example, `python train.py`).

- **Source**: public or private GitHub repo (optionally via galleries or direct URL).
- **Typical workflow**:
  - Choose **New Task → From GitHub** in the UI.
  - Provide the repo (and branch / subdirectory if needed).
  - Edit `task.yaml` for the task and define the command to run there (for example, `command: python train.py`).
  - Save and launch the task.

**File layout inside the job**

When the job starts, the cloned repo appears under the job user’s home directory:

- **GitHub repo path**: `~/github_repo_dir/...`

Here `github_repo_dir` is either the name of the subdirectory you specified in the repo, or (if you did not specify one) the name derived from the `github_repo_url`. Your training script can assume all repo files are located underneath that directory. For example:

- `~/github_repo_dir/train.py`
- `~/github_repo_dir/config.yaml`

Use these paths (or relative paths from the repo root) in your scripts when reading data, configs, or other code.

## Creating a Task From a Local Directory

You can also build tasks from code or assets that live only on your local machine.

- **Source**: local folder uploaded through the UI.
- **Typical workflow**:
  - Choose **New Task → From Local Files**.
  - Upload your project (code, scripts, and optionally a `task.yaml` file at the root).
  - Edit `task.yaml` in the UI (or use the uploaded one) and define the command to run there.
  - Save and launch the task.

**File layout inside the job**

When the job starts, the uploaded files are unpacked directly into the home directory:

- **Local upload destination**: all uploaded files are simply unpacked at `~` (the home directory).

There is **no extra top-level directory** created for you in this case. If your uploaded directory contained `train.py` and `input_data.csv` at the top level, they will appear as:

- `~/train.py`
- `~/input_data.csv`

Adjust paths in your scripts accordingly:

- For GitHub-based tasks: reference files under `~/github_repo_dir/...`
- For local uploads: reference files directly under `~/...` (no additional subfolder unless you included one yourself).

## Modifying Training Scripts for Transformer Lab

Any standard Python training script can run as a task. To make it integrate cleanly with Transformer Lab and surface useful outputs back to the UI, the main steps to include from the lab-sdk are:

- **Initialize the job with `lab.init()`**
- **Run your training/eval logic**
- **Use `lab.save_artifact(...)` for anything you want to download or reuse later**
- **Optionally call `lab.finish(...)` or `lab.error(...)` at the end**

A typical pattern looks like:

```python
from lab import lab


def main():
    # Initialize the job
    lab.init()

    # ... your training code here ...

    # Save outputs that you want visible in the UI
    lab.save_artifact("training_config.json", name="training_config.json")
    lab.save_artifact("final_model_summary.txt", name="final_model_summary.txt")

    lab.finish("Training completed successfully")


if __name__ == "__main__":
    main()
```

You can adapt existing scripts by:

- Importing `lab` and calling `lab.init(...)` once near the start.
- Inserting `lab.save_artifact(...)` calls wherever you produce artifacts you care about.
- Calling `lab.finish(...)` (or `lab.error(...)`) once at the end of the script.

## Log Visibility in the GUI

- If your script uses the lab-sdk integration (for example `lab.init(...)`), you can view both:
  - the script execution output logs, and
  - machine/system logs
    directly in the GUI.
- If your script does **not** use lab-sdk, you can still run the task, but in the GUI you will only see machine/system logs (not lab-sdk execution output logs).

## Making Outputs Available in the GUI With `lab.save_artifact`

Any file or directory you pass to `lab.save_artifact` becomes an **artifact** attached to the job. These artifacts:

- Show up on the job detail page in the GUI.
- Can be downloaded directly from the UI.
- May also appear in specialized views (datasets, models, evals) depending on the `type` you use.

### Basic usage

Use this when you simply want a file or folder downloadable from the GUI:

```python
from lab import lab

lab.init()

# Save a single file
lab.save_artifact("metrics_epoch_1.json", name="metrics_epoch_1.json")

# Save a directory (for example, logs/)
lab.save_artifact("logs", name="logs")

lab.finish("Done")
```

- **`source_path`**: path to a file or directory on disk.
- **`name` (optional)**: how the artifact will appear in the UI. If omitted, the basename of `source_path` is used.
- The function returns the **destination path** inside the job’s storage, which is useful mainly for debugging.

As long as you call `lab.save_artifact(...)` on a real path during the run, that artifact will be attached to the job and available in the GUI afterwards.

## Artifact Modes (`type` Parameter)

The `type` argument to `lab.save_artifact` controls how Transformer Lab treats an artifact and where it shows up in the UI.

### Generic artifacts (default)

- **Usage**: omit `type` or set it to `None`.
- **Behavior**: saves into the job’s general **artifacts** directory.
- **UI**: appears in the artifacts list for the job; you can download it from there.

Example:

```python
lab.save_artifact("path/to/final_model_summary.txt", name="final_model_summary.txt")
```

Use this mode for:

- Logs and JSON summaries.
- Plots saved as images.
- Any misc result files you might want to download.

### Eval results (`type="evals"`)

- **Usage**: pass a pandas DataFrame or Hugging Face dataset as `source_path` and `type="evals"`.
- **Behavior**:
  - Validates that your columns match the expected mapping.
  - Saves an eval CSV under the job’s **eval results** directory.
  - Tracks the eval file in job metadata.
- **UI**:
  - Shows up as an eval result for that job.
  - Downloadable as a CSV from the job page.

Example:

```python
import pandas as pd
from lab import lab

lab.init(experiment_id="eval-demo")

df = pd.DataFrame(
    [
        {"input": "Hello", "output": "Hi", "expected_output": "Hi", "score": 1.0},
        {"input": "Bye", "output": "Goodbye", "expected_output": "Goodbye", "score": 0.9},
    ]
)

lab.save_artifact(
    df,
    name="eval_results.csv",
    type="evals",
    config={
        "evals": {
            "input": "input",
            "output": "output",
            "expected_output": "expected_output",
            "score": "score",
        }
    },
)
```

### Datasets (`type="dataset"`)

- **Usage**:
  - Either provide a DataFrame / dataset object, or
  - Provide a path to a dataset file or directory.
- **Behavior**:
  - Saves under a job-specific **datasets** directory.
  - Registers dataset metadata so it can be listed and reused.
- **UI**:
  - Dataset can show up in dataset pickers and lists for that workspace.

Example with a DataFrame:

```python
df = ...  # pandas DataFrame or HF dataset

lab.save_artifact(
    df,
    name="my_generated_dataset",
    type="dataset",
    config={
        "dataset": {"description": "Generated training data"},
        "suffix": "v1",
        "is_image": False,  # Set True for image-style JSONL datasets
    },
)
```

### Models (`type="model"`)

- **Usage**: provide a path to a trained model directory or file and `type="model"`.
- **Behavior**:
  - Saves under a job-specific **models** directory (with a job-prefixed name).
  - Writes metadata so the model can be discovered later.
- **UI**:
  - Model can appear in local model listings and be selected by other tasks.

Example:

```python
lab.save_artifact(
    "checkpoints/best",
    name="my-awesome-model",
    type="model",
    config={
        "model": {
            "architecture": "transformers",
            "pipeline_tag": "text-generation",
            "parent_model": "gpt2",
        }
    },
)
```

### File-based eval results (`type="evals"`)

- **Usage**: provide a path to an eval file and `type="evals"`.
- **Behavior**:
  - Saves to the job’s eval results directory.
  - Tracks it as an eval artifact in job metadata.
- **UI**:
  - Appears as an eval result for the job and can be downloaded.

Example:

```python
lab.save_artifact("eval_results_raw.csv", name="eval_results_raw.csv", type="evals")
```

## Summary

- **GitHub-based tasks**: your repo is available at `~/github_repo_dir/...`.
- **Local-upload tasks**: files are unpacked directly under `~` with no extra wrapper directory.
- **To make files available in the GUI**:
  - Produce them somewhere under the job’s filesystem.
  - Call `lab.save_artifact(...)` on each file or directory you care about.
  - Choose an appropriate `type` (`None`, `"eval"`, `"dataset"`, `"model"`, `"evals"`) to control how the UI treats each artifact
