---
title: Lab SDK
sidebar_position: 70
toc_min_heading_level: 2
toc_max_heading_level: 3
---

The Lab SDK is a Python library that provides a simple, unified interface for integrating machine learning scripts with Transformer Lab.

While the Lab SDK is optional, adding it to your scripts allows for enhanced interaction with Transformer Lab, allowing you to better track the lifecycle of jobs, manage logs, store artifacts, save models, etc.

You can find the source code for the Lab SDK [here](https://github.com/transformerlab/transformerlab-app/tree/main/lab-sdk).

This guide covers available functionality with practical examples.

## Getting Started

### Installation

```bash
pip install transformerlab
```

### Basic Usage

```python
from lab import lab

# Initialize with an experiment
lab.init(experiment_id="my_experiment")

# Log messages
lab.log("Starting training...")

# Update progress
lab.update_progress(50)

# Save artifacts
lab.save_artifact("results.json", "my_results.json")

# Complete the job
lab.finish("Training completed successfully")
```

## Initialization and Lifecycle

### lab.init()

Initializes a job under the given experiment. This is the first method you should call.

**Parameters:**

- `experiment_id` (str, optional): The experiment ID. Defaults to "alpha" if not provided.
- `config` (dict, optional): Initial configuration to attach to the job.

**Example:**

```python
from lab import lab

# Simple initialization with default experiment "alpha"
lab.init()

# Initialize with a specific experiment
lab.init(experiment_id="my_training_experiment")
```

## Configuration Management

### lab.get_config()

Retrieves configuration/parameters from job data. This is particularly useful when resuming jobs or accessing parameters that were set when the task was launched.

**Returns:**

- `dict`: Configuration dictionary. Returns empty dict if no config found.

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

# Get configuration (useful for remote jobs)
config = lab.get_config()
print(f"Model: {config.get('model_name')}")
print(f"Learning rate: {config.get('learning_rate')}")
```

## Logging and Progress Tracking

### lab.log()

Logs a message to the job's output. Messages are visible in the Transformer Lab UI.

**Parameters:**

- `message` (str): The message to log.

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

lab.log("Starting data preprocessing...")
lab.log("Loading dataset...")
lab.log("Dataset loaded successfully")
lab.log(f"Training epoch {epoch + 1}/{num_epochs}")
```

### lab.update_progress()

Updates the job's progress percentage (0-100).

**Parameters:**

- `progress` (int): Progress percentage (0-100).

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

# Update progress during training
for epoch in range(num_epochs):
    train_epoch()
    progress = int((epoch + 1) / num_epochs * 100)
    lab.update_progress(progress)
    lab.log(f"Completed epoch {epoch + 1}/{num_epochs}")
```

## Artifacts Management

### lab.save_artifact()

Saves a file or directory as an artifact for the current job. Artifacts are stored in the job's artifacts directory and are visible in the Transformer Lab UI.

**Parameters:**

- `source_path` (str or DataFrame): Path to the file/directory to save, or a pandas DataFrame when `type="evals"` or `type="dataset"`.
- `name` (str, optional): Name for the artifact. If not provided, uses the source basename.
- `type` (str, optional): Type of artifact. Special types:
  - `"eval"`: Saves to eval_results directory and updates job data accordingly. Visible as Eval Results in the GUI.
  - `"dataset"`: Saves as a dataset and tracks dataset_id in job data. Visible as under the Dataset tab in the GUI.
  - `"model"`: Saves to workspace models directory and creates Model Zoo metadata. Visible as under the Model Registry tab in the GUI.
  - Otherwise: Saves to artifacts directory.
- `config` (dict, optional): Configuration dict. See specific types below for details.

**Returns:**

- `str`: The destination path on disk.

**Example - Basic Artifact:**

```python
from lab import lab
import json

lab.init(experiment_id="training")

# Save a configuration file
config = {"learning_rate": 2e-5, "batch_size": 8}
with open("config.json", "w") as f:
    json.dump(config, f)

artifact_path = lab.save_artifact("config.json", "training_config.json")
lab.log(f"Saved config to: {artifact_path}")

# Save a directory
lab.save_artifact("./output_dir", "training_output")
```

## Checkpoint Management

### lab.save_checkpoint()

Saves a checkpoint file or directory into the job's checkpoints folder. Checkpoints are tracked separately from artifacts and can be used to resume training.

**Parameters:**

- `source_path` (str): Path to the checkpoint file or directory to save.
- `name` (str, optional): Name for the checkpoint. If not provided, uses the source basename.

**Returns:**

- `str`: The destination path on disk.

**Example:**

```python
from lab import lab
import os

lab.init(experiment_id="training")

# Save a checkpoint during training
for epoch in range(num_epochs):
    # ... training code ...

    # Save checkpoint every 2 epochs
    if (epoch + 1) % 2 == 0:
        checkpoint_dir = f"./checkpoints/epoch_{epoch + 1}"
        saved_path = lab.save_checkpoint(checkpoint_dir, f"epoch_{epoch + 1}")
        lab.log(f"Saved checkpoint: {saved_path}")
```

### lab.get_checkpoint_to_resume()

Gets the checkpoint path to resume training from. This checks for checkpoint resume information stored in the job data.

**Returns:**

- `str` or `None`: The full path to the checkpoint to resume from, or None if no checkpoint resume is requested.

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

# Check if we should resume from a checkpoint
checkpoint = lab.get_checkpoint_to_resume()
if checkpoint:
    lab.log(f"Resuming training from checkpoint: {checkpoint}")
    model.load_checkpoint(checkpoint)
else:
    lab.log("Starting fresh training")
```

**Note**: This method is only available when resuming from a checkpoint using the GUI.

## Model Management

### lab.save_model()

Saves a model file or directory to the workspace models directory. The model will automatically appear under the Model Registry tab in the GUI.
This works the same as `lab.save_artifact(..., type="model")`.

**Parameters:**

- `source_path` (str): Path to the model file or directory to save.
- `name` (str, optional): Name for the model. If not provided, uses source basename. The final model name will be prefixed with the job_id for uniqueness.
- `architecture` (str, optional): Model architecture (e.g., "LlamaForCausalLM"). If not provided, will attempt to detect from config.json.
- `pipeline_tag` (str, optional): Pipeline tag (e.g., "text-generation"). If not provided and parent_model is given, will attempt to fetch from parent model on HuggingFace.
- `parent_model` (str, optional): Parent model name/ID for provenance tracking.

**Returns:**

- `str`: The destination path on disk.

**Example:**

```python
from lab import lab
import os

lab.init(experiment_id="training")

# Train your model...
# ... training code ...

# Save the trained model
model_dir = "./output/final_model"
os.makedirs(model_dir, exist_ok=True)

# Save model files
# ... save model files to model_dir ...

# Save to Model Zoo
saved_path = lab.save_model(
    model_dir,
    name="my_finetuned_model",
    architecture="LlamaForCausalLM",
    pipeline_tag="text-generation",
    parent_model="meta-llama/Llama-2-7b-hf"
)
lab.log(f"Model saved to Model Zoo: {saved_path}")
```

**Note:** This method is a convenience wrapper around `save_artifact()` with `type="model"`. For more control, use `save_artifact()` directly.

### lab.save_artifact() with type="model"

Advanced model saving with more configuration options.

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

# Save model with detailed config
saved_path = lab.save_artifact(
    source_path="./output/final_model",
    name="my_model",
    type="model",
    config={
        "model": {
            "architecture": "LlamaForCausalLM",
            "pipeline_tag": "text-generation",
            "parent_model": "meta-llama/Llama-2-7b-hf"
        }
    }
)
```

### lab.list_models()

Lists all local models available in the workspace.

**Returns:**

- `list[dict]`: List of dictionaries containing model metadata. Each dictionary includes:
  - `model_id`: The model identifier
  - `name`: The model name
  - `json_data`: Additional model metadata

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

# List all available models
models = lab.list_models()
lab.log(f"Found {len(models)} models in workspace")
for model in models:
    lab.log(f"  - {model['model_id']}: {model.get('name', 'N/A')}")
```

### lab.get_model()

Gets a specific local model by ID.

**Parameters:**

- `model_id` (str): The identifier of the model to retrieve.

**Returns:**

- `ModelService`: A Model instance for the specified model.

**Raises:**

- `FileNotFoundError`: If the model directory doesn't exist.

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

# Get a model
model = lab.get_model("my_model_id")
model_dir = model.get_dir()
lab.log(f"Model directory: {model_dir}")
```

### lab.get_model_path()

Gets the filesystem path to a specific local model.

**Parameters:**

- `model_id` (str): The identifier of the model.

**Returns:**

- `str`: The full path to the model directory.

**Raises:**

- `FileNotFoundError`: If the model doesn't exist.

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

# Get model path
model_path = lab.get_model_path("my_model_id")
lab.log(f"Model path: {model_path}")
```

---

## Dataset Management

### lab.save_dataset()

Saves a dataset under the workspace datasets directory and marks it as generated. The dataset will appear in the Transformer Lab UI.

**Parameters:**

- `df`: A pandas DataFrame or a Hugging Face datasets.Dataset to serialize to disk.
- `dataset_id` (str): Identifier for the dataset directory under `datasets/`.
- `additional_metadata` (dict, optional): Optional dict to merge into dataset json_data.
- `suffix` (str, optional): Optional suffix to append to the output filename stem.
- `is_image` (bool): If True, save JSON Lines (for image metadata-style rows).

**Returns:**

- `str`: The path to the saved dataset file on disk.

**Example:**

```python
from lab import lab
import pandas as pd

lab.init(experiment_id="data_processing")

# Create a dataset
data = {
    "input": ["What is AI?", "What is ML?"],
    "output": ["AI is...", "ML is..."],
    "label": [1, 1]
}
df = pd.DataFrame(data)

# Save the dataset
dataset_path = lab.save_dataset(
    df=df,
    dataset_id="my_custom_dataset",
    additional_metadata={
        "description": "Custom training dataset",
        "source": "manually_created"
    }
)
lab.log(f"Dataset saved to: {dataset_path}")
```

**Example - Using save_artifact with type="dataset":**

```python
from lab import lab
import pandas as pd

lab.init(experiment_id="data_processing")

# Create dataset
df = pd.DataFrame({
    "question": ["Q1", "Q2"],
    "answer": ["A1", "A2"]
})

# Save using save_artifact
dataset_path = lab.save_artifact(
    source_path=df,
    name="my_dataset",
    type="dataset",
    config={
        "dataset": {
            "description": "Question-answer dataset",
            "task": "qa"
        },
        "suffix": "v1",
        "is_image": False
    }
)
```

---

## Evaluation Results

### lab.save_artifact() with type="evals"

Saves evaluation results as a CSV file. The results are stored in the job's eval_results directory and are visible in the Transformer Lab UI.

**Parameters:**

- `source_path`: A pandas DataFrame or Hugging Face datasets.Dataset with evaluation results.
- `name` (str, optional): Name for the evaluation results file. Defaults to `eval_results_{job_id}_{timestamp}.csv`.
- `type` (str): Must be `"evals"`.
- `config` (dict, optional): Configuration dict with column mappings under `"evals"` key:

  ```python
  {
      "evals": {
          "input": "input_col",           # Column name for input
          "output": "output_col",         # Column name for model output
          "expected_output": "expected_col",  # Column name for expected output (optional)
          "score": "score_col"            # Column name for score
      }
  }
  ```

**Default Column Names:**
If column mappings are not provided, the following defaults are used:

- `input`: "input"
- `output`: "output"
- `expected_output`: "expected_output"
- `score`: "score"

**Example - Default Column Names:**

```python
from lab import lab
import pandas as pd

lab.init(experiment_id="evaluation")

# Create evaluation results with default column names for colour highlighting in the GUI.
results = pd.DataFrame({
    "input": ["What is 2+2?", "What is 3+3?"],
    "output": ["4", "6"],
    "expected_output": ["4", "6"],
    "score": [1.0, 1.0]
})

# Save evaluation results
eval_path = lab.save_artifact(
    source_path=results,
    name="eval_results.csv",
    type="evals"
)
lab.log(f"Evaluation results saved to: {eval_path}")
```

**Example - Custom Column Names:**

```python
from lab import lab
import pandas as pd

lab.init(experiment_id="evaluation")

# Create evaluation results with custom column names
results = pd.DataFrame({
    "question": ["What is 2+2?", "What is 3+3?"],
    "model_response": ["4", "6"],
    "ground_truth": ["4", "6"],
    "accuracy": [1.0, 1.0]
})

# Save with column mappings
eval_path = lab.save_artifact(
    source_path=results,
    name="eval_results_custom.csv",
    type="evals",
    config={
        "evals": {
            "input": "question",
            "output": "model_response",
            "expected_output": "ground_truth",
            "score": "accuracy"
        }
    }
)
lab.log(f"Evaluation results saved to: {eval_path}")
```

## Job Completion

### lab.finish()

Marks the job as successfully completed and sets completion metadata.

**Parameters:**

- `message` (str): Completion message. Defaults to "Job completed successfully".
- `score` (dict, optional): Optional score/metrics dictionary to attach to the job.

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

# ... training code ...

# Complete the job with a message
lab.finish("Training completed successfully")

# Complete with score/metrics
lab.finish(
    message="Training completed successfully",
    score={
        "final_loss": 0.15,
        "accuracy": 0.92,
        "f1_score": 0.89
    }
)

```

### lab.error()

Marks the job as failed and sets completion metadata.

**Parameters:**

- `message` (str): Error message describing what went wrong.

**Example:**

```python
from lab import lab

lab.init(experiment_id="training")

try:
    # ... training code ...
    pass
except Exception as e:
    error_msg = f"Training failed: {str(e)}"
    lab.error(error_msg)
    raise
```

## HuggingFace Integration

### lab.get_hf_callback()

Gets a HuggingFace TrainerCallback instance for Transformer Lab integration. This callback automatically:

- Updates training progress in Transformer Lab
- Logs training metrics (loss, etc.)
- Saves checkpoints to Transformer Lab when they are created
- Logs epoch completion and training end events

**Returns:**

- `LabCallback`: A TrainerCallback instance that can be passed to HuggingFace Trainer.

**Example:**

```python
from lab import lab
from transformers import Trainer, TrainingArguments

lab.init(experiment_id="training")

# Get the callback
callback = lab.get_hf_callback()

# Create trainer with the callback
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset,
    callbacks=[callback],  # Add the callback
)

# Train - progress will be automatically tracked
trainer.train()
```

**Example - Custom Callback:**

You can also create a custom callback that extends the Lab callback:

```python
from lab import lab
from transformers import TrainerCallback

lab.init(experiment_id="training")

class CustomLabCallback(TrainerCallback):
    def __init__(self):
        self.lab_callback = lab.get_hf_callback()

    def on_step_end(self, args, state, control, **kwargs):
        # Call the lab callback
        self.lab_callback.on_step_end(args, state, control, **kwargs)

        # Add custom logic
        if state.global_step % 100 == 0:
            lab.log(f"Custom logging at step {state.global_step}")

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset,
    callbacks=[CustomLabCallback()],
)
```

## Complete Example

Here's a complete example that demonstrates most of the functionality:

```python
from lab import lab
import pandas as pd
import os
from datetime import datetime

def train_model():
    """Complete training script using Lab SDK"""

    # 1. Initialize
    lab.init(experiment_id="my_training_experiment")

    # 2. Load data
    lab.log("Loading dataset...")
    # ... load dataset ...
    lab.update_progress(10)

    # 3. Training loop
    lab.log("Starting training...")
    for epoch in range(config["num_epochs"]):
        # ... training code ...

        # Save checkpoint
        if (epoch + 1) % 2 == 0:
            checkpoint_dir = f"./checkpoints/epoch_{epoch + 1}"
            lab.save_checkpoint(checkpoint_dir, f"epoch_{epoch + 1}")
            lab.log(f"Saved checkpoint for epoch {epoch + 1}")

        # Update progress
        progress = int((epoch + 1) / config["num_epochs"] * 100)
        lab.update_progress(progress)

    # 4. Save model
    model_dir = "./output/final_model"
    saved_model_path = lab.save_model(
        model_dir,
        name="trained_model",
        architecture="GPT2LMHeadModel",
        parent_model="gpt2"
    )
    lab.log(f"Model saved: {saved_model_path}")

    # 5. Run evaluation
    lab.log("Running evaluation...")
    eval_results = pd.DataFrame({
        "input": ["test input 1", "test input 2"],
        "output": ["output 1", "output 2"],
        "expected_output": ["expected 1", "expected 2"],
        "score": [1.0, 0.8]
    })

    eval_path = lab.save_artifact(
        eval_results,
        name="eval_results.csv",
        type="evals"
    )
    lab.log(f"Evaluation results saved: {eval_path}")

    # 6. Save additional artifacts
    summary = {"final_loss": 0.15, "accuracy": 0.92}
    import json
    with open("summary.json", "w") as f:
        json.dump(summary, f)

    lab.save_artifact("summary.json", "training_summary.json")

    # 7. Complete job
    lab.finish(
        message="Training completed successfully",
        score=summary
    )

    return {
        "status": "success",
        "job_id": lab.job.id,
        "model_path": saved_model_path,
        "eval_path": eval_path
    }

if __name__ == "__main__":
    result = train_model()
    print(result)
```

## Best Practices

1. **Always initialize first**: Call `lab.init()` at the beginning of your script.

2. **Log frequently**: Use `lab.log()` to provide visibility into your script's progress.

3. **Update progress regularly**: Call `lab.update_progress()` to keep the UI updated.

4. **Save checkpoints**: Use `lab.save_checkpoint()` regularly during long-running training jobs.

5. **Handle errors**: Use `lab.error()` in exception handlers to mark jobs as failed.

6. **Complete jobs**: Always call `lab.finish()` or `lab.error()` at the end of your script.

7. **Use appropriate artifact types**: Use `type="model"` for models, `type="evals"` for evaluation results, and `type="dataset"` for datasets.

8. **Check for resume**: Use `lab.get_checkpoint_to_resume()` to support resuming from checkpoints.
