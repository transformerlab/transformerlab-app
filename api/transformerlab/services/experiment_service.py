import logging
import json

from lab import Experiment
from lab import dirs as lab_dirs
from lab import storage

from transformerlab.services.cache_service import cache, cached

logger = logging.getLogger(__name__)


@cached(key="experiments:list", ttl="30s", tags=["experiments"])
async def experiment_get_all():
    experiments: list[dict] = []

    experiments_dir = await lab_dirs.get_experiments_dir()
    if not await storage.exists(experiments_dir):
        logger.debug("Experiments directory does not exist: %s", experiments_dir)
        return experiments

    try:
        base_dir = str(experiments_dir).rstrip("/")
        exp_paths = sorted(await storage.ls(experiments_dir, detail=False))

        for exp_path in exp_paths:
            exp_path_norm = str(exp_path).rstrip("/")

            # Defensive: `ls` should not include the base dir itself, but skip if it does.
            if exp_path_norm == base_dir:
                logger.debug("Skipping base experiments directory entry: %s", exp_path_norm)
                continue

            if not await storage.isdir(exp_path_norm):
                logger.debug("Skipping non-directory experiment path: %s", exp_path_norm)
                continue

            exp_dir = exp_path_norm.split("/")[-1]
            if exp_dir == "experiments":
                logger.debug("Skipping nested experiments directory entry: %s", exp_path_norm)
                continue

            index_file = storage.join(exp_path_norm, "index.json")
            if not await storage.exists(index_file):
                logger.debug("Skipping experiment without index.json: %s", exp_path_norm)
                continue

            # Avoid calling `Experiment.get_json_data()` for the list view; that can
            # trigger lab-side index rebuilds (and warnings) when `jobs/` doesn't exist yet.
            exp_dict: dict | None = None
            try:
                async with await storage.open(index_file, "r", encoding="utf-8") as f:
                    raw = await f.read()
                parsed = json.loads(raw) if raw else {}
                if isinstance(parsed, dict):
                    exp_dict = parsed
            except Exception as e:
                logger.debug("Failed reading experiment index file %s: %s", index_file, e)
                exp_dict = None

            # Ensure dropdown always has `id` + `name`.
            if not exp_dict or not exp_dict.get("id") or not exp_dict.get("name"):
                logger.debug(
                    "Experiment index missing id/name, falling back to experiment_get for: %s",
                    exp_dir,
                )
                exp_dict = await experiment_get(exp_dir)

            if isinstance(exp_dict, dict) and exp_dict:
                exp_dict.setdefault("id", exp_dir)
                exp_dict.setdefault("name", exp_dict.get("id") or exp_dir)
                experiments.append(exp_dict)
            else:
                logger.debug("Skipping experiment after fallback returned no data: %s", exp_dir)
    except Exception as e:
        logger.debug("Failed to list experiments from %s: %s", experiments_dir, e)

    return experiments


async def experiment_create(name: str, config: dict) -> str:
    await Experiment.create_with_config(name, config)
    # Ensure the experiment dropdown refreshes immediately after creation.
    await cache.invalidate("experiments")
    return name


async def experiment_get(id):
    try:
        exp = await Experiment.get(id)
        data = await exp.get_json_data()
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


async def experiment_delete(id):
    try:
        exp = await Experiment.get(id)
        await exp.delete()
        await cache.invalidate("experiments")
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error deleting experiment {id}: {e}")


async def experiment_update(id, config):
    try:
        exp = await Experiment.get(id)
        await exp.update_config(config)
        await cache.invalidate("experiments")
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment {id}: {e}")


async def experiment_update_config(id, key, value):
    try:
        exp = await Experiment.get(id)
        await exp.update_config_field(key, value)
        await cache.invalidate("experiments")
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment config key {key}: {e}")


async def experiment_save_prompt_template(id, template):
    try:
        exp_obj = await Experiment.get(id)
        await exp_obj.update_config_field("prompt_template", template)
        await cache.invalidate("experiments")
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error saving prompt template: {e}")


async def experiment_update_configs(id, updates: dict):
    try:
        exp_obj = await Experiment.get(id)
        await exp_obj.update_config(updates)
        await cache.invalidate("experiments")
    except FileNotFoundError:
        print(f"Experiment with id '{id}' not found")
    except Exception as e:
        print(f"Error updating experiment config: {e}")
