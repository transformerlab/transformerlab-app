import json

from lab import Experiment
from lab import dirs as lab_dirs
from lab import storage

from transformerlab.middleware import cache


def experiment_get_all():
    experiments = []
    experiments_dir = lab_dirs.get_experiments_dir()
    if storage.exists(experiments_dir):
        try:
            exp_dirs = storage.ls(experiments_dir, detail=False)
            # Sort the directories
            exp_dirs = sorted(exp_dirs)
            for exp_path in exp_dirs:
                # Skip if this is the experiments directory itself (shouldn't happen but safety check)
                if exp_path.rstrip("/") == experiments_dir.rstrip("/"):
                    continue
                if storage.isdir(exp_path):
                    # Check if this directory is actually a valid experiment by checking for index.json
                    index_file = storage.join(exp_path, "index.json")
                    if not storage.exists(index_file):
                        # Skip directories that don't have index.json (not valid experiments)
                        continue
                    # Extract the directory name from the path
                    exp_dir = exp_path.rstrip("/").split("/")[-1]
                    # Skip if the extracted name is the experiments directory itself (shouldn't happen but safety check)
                    if exp_dir == "experiments":
                        continue
                    exp_dict = experiment_get(exp_dir)
                    if exp_dict:
                        experiments.append(exp_dict)
        except Exception:
            pass
    return experiments


def experiment_create(name: str, config: dict) -> str:
    Experiment.create_with_config(name, config)
    # No cache to clear for create, as it's a new ID.
    # But if we cached "list of experiments", we would clear it here.
    return name


def experiment_get(id):
    if id in ["new", "create", "delete", "update", "list", "all"]:
        return None

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
        # Invalidate cache
        import asyncio

        asyncio.create_task(
            cache.clear_function_cache("transformerlab.routers.experiment.experiment", "experiment_get", id=id)
        )
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error deleting experiment {id}: {e}")


def experiment_update(id, config):
    try:
        exp = Experiment.get(id)
        exp.update_config(config)
        import asyncio

        asyncio.create_task(
            cache.clear_function_cache("transformerlab.routers.experiment.experiment", "experiment_get", id=id)
        )
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment {id}: {e}")


def experiment_update_config(id, key, value):
    try:
        exp = Experiment.get(id)
        exp.update_config_field(key, value)
        import asyncio

        asyncio.create_task(
            cache.clear_function_cache("transformerlab.routers.experiment.experiment", "experiment_get", id=id)
        )
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment config key {key}: {e}")


def experiment_save_prompt_template(id, template):
    try:
        exp_obj = Experiment.get(id)
        exp_obj.update_config_field("prompt_template", template)
        import asyncio

        asyncio.create_task(
            cache.clear_function_cache("transformerlab.routers.experiment.experiment", "experiment_get", id=id)
        )
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error saving prompt template: {e}")


def experiment_update_configs(id, updates: dict):
    try:
        exp_obj = Experiment.get(id)
        exp_obj.update_config(updates)
        import asyncio

        asyncio.create_task(
            cache.clear_function_cache("transformerlab.routers.experiment.experiment", "experiment_get", id=id)
        )
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment config: {e}")
