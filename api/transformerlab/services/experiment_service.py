import asyncio
import logging
import json
import os
import re

from sqlalchemy import delete
from lab import Experiment
from lab import dirs as lab_dirs
from lab import storage

from transformerlab.db.session import async_session
from transformerlab.services.cache_service import cache, cached
from transformerlab.shared.models.models import UserExperimentAccess

logger = logging.getLogger(__name__)
EXPERIMENT_LIST_CONCURRENCY = max(1, int(os.getenv("TLAB_EXPERIMENT_LIST_CONCURRENCY", "24")))

_TAG_PATTERN = re.compile(r"^[a-z0-9._-]{1,32}$")
TAG_MAX_LEN = 32
TAGS_MAX_PER_EXPERIMENT = 20


def normalize_tags(raw):
    """Lowercase, trim, validate charset (a-z0-9._-, max 32 chars), and dedupe.

    Raises ValueError on the first invalid tag.
    """
    seen = set()
    result = []
    for item in raw or []:
        if not isinstance(item, str):
            raise ValueError(f"Tag must be a string, got {type(item).__name__}: {item!r}")
        normalized = item.strip().lower()
        if not normalized:
            raise ValueError("Tag is empty after trimming whitespace")
        if len(normalized) > TAG_MAX_LEN:
            raise ValueError(f"Tag {normalized!r} exceeds max length {TAG_MAX_LEN}")
        if not _TAG_PATTERN.match(normalized):
            raise ValueError(
                f"Tag {normalized!r} contains invalid characters (allowed: lowercase a-z, 0-9, '.', '-', '_')"
            )
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


@cached(key="experiments:list", ttl="2m", tags=["experiments"])
async def experiment_get_all():
    experiments: list[dict] = []

    async def _read_experiment_index(exp_path: str) -> dict | None:
        exp_path_norm = str(exp_path).rstrip("/")
        exp_dir = exp_path_norm.split("/")[-1]
        if exp_dir == "experiments":
            logger.debug("Skipping nested experiments directory entry: %s", exp_path_norm)
            return None

        index_file = storage.join(exp_path_norm, "index.json")
        exp_dict: dict | None = None
        try:
            async with await storage.open(index_file, "r", encoding="utf-8") as f:
                raw = await f.read()
            parsed = json.loads(raw) if raw else {}
            if isinstance(parsed, dict):
                exp_dict = parsed
        except FileNotFoundError:
            logger.debug("Skipping experiment without index.json: %s", exp_path_norm)
            return None
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
            return exp_dict

        logger.debug("Skipping experiment after fallback returned no data: %s", exp_dir)
        return None

    experiments_dir = await lab_dirs.get_experiments_dir()
    if not await storage.exists(experiments_dir):
        logger.debug("Experiments directory does not exist: %s", experiments_dir)
        return experiments

    try:
        base_dir = str(experiments_dir).rstrip("/")
        exp_entries = await storage.ls(experiments_dir, detail=True)

        exp_paths: list[str] = []
        for entry in exp_entries:
            # fsspec detail entries are dicts in most providers.
            if isinstance(entry, dict):
                entry_name = str(entry.get("name", "")).rstrip("/")
                entry_type = str(entry.get("type", "")).lower()
                if entry_name == base_dir:
                    logger.debug("Skipping base experiments directory entry: %s", entry_name)
                    continue
                if entry_type and entry_type != "directory":
                    logger.debug("Skipping non-directory experiment path: %s", entry_name)
                    continue
                if entry_name:
                    exp_paths.append(entry_name)
                continue

            entry_path = str(entry).rstrip("/")
            if entry_path == base_dir:
                logger.debug("Skipping base experiments directory entry: %s", entry_path)
                continue
            exp_paths.append(entry_path)

        sem = asyncio.Semaphore(EXPERIMENT_LIST_CONCURRENCY)

        async def _read_with_limit(exp_path: str) -> dict | None:
            async with sem:
                return await _read_experiment_index(exp_path)

        results = await asyncio.gather(*(_read_with_limit(p) for p in sorted(exp_paths)))
        experiments = [result for result in results if result]
    except Exception as e:
        logger.debug("Failed to list experiments from %s: %s", experiments_dir, e)

    return experiments


async def experiment_create(name: str, config: dict, created_by: str | None = None) -> str:
    if created_by:
        config = {**config, "created_by": created_by}
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
        async with async_session() as session:
            await session.execute(delete(UserExperimentAccess).where(UserExperimentAccess.experiment_id == str(id)))
            await session.commit()
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


async def _read_current_tags(experiment_id):
    exp = await Experiment.get(experiment_id)
    data = await exp.get_json_data()
    config = data.get("config", {})
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except json.JSONDecodeError:
            config = {}
    raw = config.get("tags", []) or []
    if not isinstance(raw, list):
        return exp, []
    return exp, [t for t in raw if isinstance(t, str)]


async def experiment_add_tags(experiment_id, tags):
    """Union-merge ``tags`` into the experiment's existing tags. Returns the full list."""
    new_tags = normalize_tags(tags)
    exp, current = await _read_current_tags(experiment_id)
    merged = list(current)
    for t in new_tags:
        if t not in merged:
            merged.append(t)
    if len(merged) > TAGS_MAX_PER_EXPERIMENT:
        raise ValueError(f"Cannot exceed {TAGS_MAX_PER_EXPERIMENT} tags per experiment (would be {len(merged)})")
    await exp.update_config_field("tags", merged)
    await cache.invalidate("experiments")
    return merged


async def experiment_remove_tags(experiment_id, tags):
    """Set-difference ``tags`` from the experiment's existing tags. Returns the full list."""
    to_remove = set(normalize_tags(tags))
    exp, current = await _read_current_tags(experiment_id)
    kept = [t for t in current if t not in to_remove]
    await exp.update_config_field("tags", kept)
    await cache.invalidate("experiments")
    return kept


def aggregate_tags(experiments):
    """Return a sorted, deduped list of all tags across ``experiments``."""
    bag = set()
    for exp in experiments or []:
        config = exp.get("config", {}) if isinstance(exp, dict) else {}
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except json.JSONDecodeError:
                config = {}
        tags = config.get("tags", []) if isinstance(config, dict) else []
        if not isinstance(tags, list):
            continue
        for t in tags:
            if isinstance(t, str) and t:
                bag.add(t)
    return sorted(bag)
