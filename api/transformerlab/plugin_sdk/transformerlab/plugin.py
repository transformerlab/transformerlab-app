import os
import json
import sqlite3
import sys
from pathlib import Path
from typing import Optional

from jinja2 import Environment
from transformers import AutoTokenizer

from lab import HOME_DIR, Experiment
from lab import storage
from lab.dirs import get_workspace_dir
from lab.dataset import Dataset as dataset_service

# useful constants
# Use shared constant as sole source of truth
DATABASE_FILE_NAME = f"{HOME_DIR}/llmlab.sqlite3"
WORKSPACE_DIR = get_workspace_dir()
if WORKSPACE_DIR is None:
    print("Plugin Harness Error: WORKSPACE_DIR not available. Quitting.")
    exit(1)
TEMP_DIR = storage.join(get_workspace_dir(), "temp")

# Maintain a singleton database connection
db = None


def register_process(pid_or_pids):
    """
    Record one or many PIDs in <LLM_LAB_ROOT_PATH>/worker.pid so that
    the 'worker_stop' endpoint can later clean them up.
    """
    if isinstance(pid_or_pids, int):
        pids = [pid_or_pids]
    else:
        pids = list(pid_or_pids)
    root_dir = os.getenv("LLM_LAB_ROOT_PATH")
    if not root_dir:
        raise EnvironmentError("LLM_LAB_ROOT_PATH is not set")
    pid_file = os.path.join(root_dir, "worker.pid")
    with open(pid_file, "w") as f:
        for pid in pids:
            f.write(f"{pid}\n")
    return pids


def get_db_connection():
    """
    Returns an SQLite DB connection to the Transformer Lab DB
    """
    global db
    if db is None:
        dbfile = DATABASE_FILE_NAME
        db = sqlite3.connect(dbfile, isolation_level=None)

        # Need to set these every time we open a connection
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=normal")
        db.execute("PRAGMA busy_timeout=30000")
    return db


def get_dataset_path(dataset_id: str):
    """
    Returns the ID or filesystem path to pass to load_dataset() for a given ID,
    using the dataset service instead of the deprecated DB table.
    """
    try:
        ds = dataset_service.get(dataset_id)
        metadata = ds.get_metadata()
    except FileNotFoundError:
        raise Exception(f"No dataset named {dataset_id} installed.")

    location = (metadata or {}).get("location", "huggingface")
    if location == "local":
        # Use service path resolution to ensure correctness
        try:
            return ds.get_dir()
        except Exception:
            # Fallback to previous behavior if needed
            return storage.join(get_workspace_dir(), "datasets", dataset_id)

    # Otherwise assume it is a HuggingFace dataset id
    return dataset_id


def get_db_config_value(key: str, team_id: Optional[str] = None, user_id: Optional[str] = None):
    """
    Returns the value of a config key from the database with priority:
    user-specific -> team-wide -> global config.

    Args:
        key: Config key to retrieve
        team_id: Optional team_id. If None, extracted from workspace_dir path.
        user_id: Optional user_id. If None, only team-wide and global configs are checked.

    Priority order:
    1. User-specific (user_id set, team_id matches)
    2. Team-wide (user_id IS NULL, team_id set)
    3. Global (user_id IS NULL, team_id IS NULL)
    """
    db = get_db_connection()

    # Extract team_id from workspace_dir if not provided
    if team_id is None:
        try:
            workspace_dir = get_workspace_dir()
            if workspace_dir and "/orgs/" in workspace_dir:
                # Extract team_id from path like ~/.transformerlab/orgs/<team_id>/workspace
                parts = workspace_dir.split("/orgs/")
                if len(parts) > 1:
                    team_id = parts[1].split("/")[0]
        except Exception:
            pass  # If we can't get team_id, fall back to global config

    # Get user_id from environment if not provided
    if user_id is None:
        user_id = os.environ.get("_TFL_USER_ID")

    # Priority 1: User-specific config (if user_id and team_id are provided)
    if user_id and team_id:
        cursor = db.execute(
            "SELECT value FROM config WHERE key = ? AND user_id = ? AND team_id = ?", (key, user_id, team_id)
        )
        row = cursor.fetchone()
        cursor.close()
        if row is not None:
            return row[0]

    # Priority 2: Team-wide config (user_id IS NULL, team_id set)
    if team_id:
        cursor = db.execute(
            "SELECT value FROM config WHERE key = ? AND user_id IS NULL AND team_id = ?", (key, team_id)
        )
        row = cursor.fetchone()
        cursor.close()
        if row is not None:
            return row[0]

    # Priority 3: Global config (user_id IS NULL, team_id IS NULL)
    cursor = db.execute("SELECT value FROM config WHERE key = ? AND user_id IS NULL AND team_id IS NULL", (key,))
    row = cursor.fetchone()
    cursor.close()

    if row is None:
        return None
    return row[0]


def test_wandb_login(project_name: str = "TFL_Training"):
    """
    Check if WANDB is configured and can be used.
    Checks WANDB_API_KEY environment variable first (set by plugin_harness),
    then falls back to netrc file for backward compatibility.
    """
    # First check for WANDB_API_KEY in environment (set by plugin_harness from database)
    wandb_api_key = os.environ.get("WANDB_API_KEY")
    if wandb_api_key and wandb_api_key.strip():
        os.environ["WANDB_PROJECT"] = project_name
        os.environ["WANDB_DISABLED"] = "false"
        report_to = ["tensorboard", "wandb"]
        return True, report_to

    # Fallback to netrc file for backward compatibility
    import netrc

    netrc_path = Path.home() / (".netrc" if os.name != "nt" else "_netrc")
    if netrc_path.exists():
        auth = netrc.netrc(netrc_path).authenticators("api.wandb.ai")
        if auth:
            os.environ["WANDB_PROJECT"] = project_name
            os.environ["WANDB_DISABLED"] = "false"
            report_to = ["tensorboard", "wandb"]
            return True, report_to

    # No WANDB credentials found
    os.environ["WANDB_DISABLED"] = "true"
    return False, ["tensorboard"]


def experiment_get(id):
    try:
        exp_obj = Experiment.get(id)
        return exp_obj.get_json_data()
    except Exception:
        return None


def get_experiment_config(name: str):
    """
    Returns the experiment config from the experiment name.
    """
    try:
        exp_obj = Experiment.get(name)
        json_data = exp_obj.get_json_data()
        if json_data:
            return json_data["config"], name
    except Exception:
        return None, name


def get_python_executable(plugin_dir):
    """Check if a virtual environment exists and return the appropriate Python executable"""
    # Check for virtual environment in the plugin directory
    venv_path = os.path.join(plugin_dir, "venv")

    if os.path.isdir(venv_path):
        print("Virtual environment found, using it for evaluation...")
        # Determine the correct path to the Python executable based on the platform
        python_executable = os.path.join(venv_path, "bin", "python")

        if os.path.exists(python_executable):
            return python_executable

    # Fall back to system Python if venv not found or executable doesn't exist
    print("No virtual environment found, using system Python...")
    return sys.executable


def generate_model_json(
    model_id: str,
    architecture: str,
    model_filename: str = "",
    output_directory: str | None = None,
    json_data: dict = {},
):
    """
    The generates the json file needed for a model to be read in the models directory.

    model_id: ID of the model without author prefix. This will also be the directory the file is output to.
    architecture: A string that is used to determine which plugins support this model.
    filename: (Optional) A string representing model_filename or "" if none.
    output_directory: (Optional) The directory to output this file. Otherwise TLab models directory.
    json_data: (Default empty) A dictionary of values to add to the json_data of this model.

    Returns the object used to generate the JSON.
    """
    model_description = {
        "model_id": f"TransformerLab/{model_id}",
        "model_filename": model_filename,
        "name": model_id,
        "local_model": True,
        "json_data": {
            "uniqueID": f"TransformerLab/{model_id}",
            "name": model_id,
            "model_filename": model_filename,
            "description": "Generated by Transformer Lab.",
            "source": "transformerlab",
            "architecture": architecture,
            "huggingface_repo": "",
        },
    }

    # Add and update any fields passed in json_data object
    # This overwrites anything defined above with values passed in
    model_description["json_data"].update(json_data)

    # Output the json to the file
    if not output_directory:
        output_directory = storage.join(get_workspace_dir(), "models", model_id)
    with storage.open(storage.join(output_directory, "index.json"), "w") as outfile:
        json.dump(model_description, outfile)

    return model_description


def prepare_dataset_files(
    data_directory: str,
    datasets: dict,
    formatting_template: str = None,
    chat_template: str = None,
    model_name: str = None,
    chat_column: str = "messages",
):
    """Prepares dataset files for training by formatting each example according to the provided template."""
    tokenizer = None
    if chat_template:
        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)

    for split_name in datasets:
        dataset_split = datasets[split_name]
        print(f"Processing {split_name} dataset with {len(dataset_split)} examples.")

        output_file = storage.join(data_directory, f"{split_name}.jsonl")
        with storage.open(output_file, "w") as f:
            for i in range(len(dataset_split)):
                example = dataset_split[i]
                try:
                    rendered_text = format_template(
                        example=example,
                        formatting_template=formatting_template,
                        chat_template=chat_template,
                        tokenizer=tokenizer,
                        chat_column=chat_column,
                    )
                    rendered_text = rendered_text.replace("\n", "\\n").replace("\r", "\\r")
                    f.write(json.dumps({"text": rendered_text}) + "\n")
                except Exception:
                    print(f"Warning: Failed to process example {i} in '{split_name}'. Skipping.")
                    continue  # Skip problematic examples

        # Print one example from the written jsonl file
        try:
            with storage.open(output_file, "r") as f:
                first_line = f.readline()
                if first_line:
                    parsed = json.loads(first_line)
                    print(f"Example from {split_name} split:")
                    print(parsed.get("text", first_line))
                else:
                    print(f"Example from {split_name} split: file is empty.")
        except Exception as e:
            print(f"Error reading example from {output_file}: {e}")


def format_template(
    example: dict,
    formatting_template: str = None,
    chat_template: str = None,
    tokenizer: AutoTokenizer = None,
    chat_column: str = "messages",
):
    """Formats a single example using either a Jinja2 template or a chat template."""
    if chat_template and tokenizer:
        if tokenizer.chat_template is None:
            raise ValueError("Tokenizer lacks a default chat template. Ensure model is instruction-tuned for chat.")
        return tokenizer.apply_chat_template(
            example[chat_column], tokenize=False, add_generation_prompt=False, chat_template=chat_template
        )

    if formatting_template:
        jinja_env = Environment()
        formatting_template = jinja_env.from_string(formatting_template)
        return formatting_template.render(example)
    raise ValueError("Either formatting_template or chat_template must be provided.")
