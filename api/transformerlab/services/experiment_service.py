import json

from datetime import datetime

from lab import Experiment
from lab import dirs as lab_dirs
from lab import storage

# Simple in-memory cache
_experiments_cache = None
_cache_timestamp = None
_cache_ttl = 30  # seconds


def experiment_get_all():
    global _experiments_cache, _cache_timestamp

    # Check cache
    now = datetime.now()
    if _experiments_cache is not None and _cache_timestamp is not None:
        if (now - _cache_timestamp).total_seconds() < _cache_ttl:
            return _experiments_cache

    experiments_dir = lab_dirs.get_experiments_dir()
    dir_exists = storage.exists(experiments_dir)

    if not dir_exists:
        _experiments_cache = []
        _cache_timestamp = now

        return []

    experiments = []

    try:
        exp_dirs = storage.ls(experiments_dir, detail=False)
        processed = 0

        for i, exp_path in enumerate(exp_dirs):
            if not storage.isdir(exp_path):
                continue

            exp_dir = exp_path.rstrip("/").split("/")[-1]
            if exp_dir == "experiments":
                continue

            experiments.append(
                {
                    "id": exp_dir,
                    "name": exp_dir,
                }
            )
            processed += 1

        experiments.sort(key=lambda x: x["id"])
        _experiments_cache = experiments
        _cache_timestamp = now

    except Exception:
        import traceback

        traceback.print_exc()
        if _experiments_cache is not None:
            return _experiments_cache
        return []

    return experiments


def clear_experiments_cache():
    """Call when experiments are modified"""
    global _experiments_cache, _cache_timestamp
    print("Clearing experiments cache")
    _experiments_cache = None
    _cache_timestamp = None


def experiment_create(name: str, config: dict) -> str:
    Experiment.create_with_config(name, config)
    return name


def experiment_get(id):
    try:
        exp = Experiment.get(id)
        data = exp.get_json_data()
        # Parse config field from JSON string to dict if needed
        config = data.get("config", {})
        if isinstance(config, str):
            try:
                data["config"] = json.loads(config)
            except json.JSONDecodeError:
                data["config"] = {}
        return data
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
        return None
    except Exception as e:
        print(f"Error getting experiment {id}: {e}")
        return None


def experiment_delete(id):
    try:
        exp = Experiment.get(id)
        exp.delete()
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error deleting experiment {id}: {e}")


def experiment_update(id, config):
    try:
        exp = Experiment.get(id)
        exp.update_config(config)
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment {id}: {e}")


def experiment_update_config(id, key, value):
    try:
        exp = Experiment.get(id)
        exp.update_config_field(key, value)
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment config key {key}: {e}")


def experiment_save_prompt_template(id, template):
    try:
        exp_obj = Experiment.get(id)
        exp_obj.update_config_field("prompt_template", template)
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error saving prompt template: {e}")


def experiment_update_configs(id, updates: dict):
    try:
        exp_obj = Experiment.get(id)
        exp_obj.update_config(updates)
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment config: {e}")
