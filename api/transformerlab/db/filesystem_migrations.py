import json
import os
import shutil

from lab.dataset import Dataset as dataset_service
from lab.task import Task as task_service
from lab import Experiment, Job, dirs as lab_dirs
from datetime import datetime


async def migrate_datasets_table_to_filesystem():
    """
    One-time migration: copy rows from the legacy dataset DB table into the filesystem
    registry via transformerlab-sdk, then drop the table.
    Safe to run multiple times; it will no-op if table is missing or empty.
    """
    try:
        # Late import to avoid hard dependency during tests without DB
        from sqlalchemy import text as sqlalchemy_text
        from transformerlab.db.session import async_session

        # Read existing rows
        rows = []
        try:
            # First check if the table exists
            async with async_session() as session:
                result = await session.execute(
                    sqlalchemy_text("SELECT name FROM sqlite_master WHERE type='table' AND name='dataset'")
                )
                exists = result.fetchone() is not None
            if not exists:
                return
            # Migrated db.dataset.get_datasets() to run here as we are deleting that code
            rows = []
            async with async_session() as session:
                result = await session.execute(sqlalchemy_text("SELECT * FROM dataset"))
                datasets = result.mappings().all()
                dict_rows = [dict(dataset) for dataset in datasets]
                for row in dict_rows:
                    if "json_data" in row and row["json_data"]:
                        if isinstance(row["json_data"], str):
                            row["json_data"] = json.loads(row["json_data"])
                    rows.append(row)
        except Exception as e:
            print(f"Failed to read datasets for migration: {e}")
            rows = []

        migrated = 0
        for row in rows:
            dataset_id = str(row.get("dataset_id")) if row.get("dataset_id") is not None else None
            if not dataset_id:
                continue
            location = row.get("location", "local")
            description = row.get("description", "")
            size = int(row.get("size", -1)) if row.get("size") is not None else -1
            json_data = row.get("json_data", {})
            if isinstance(json_data, str):
                try:
                    json_data = json.loads(json_data)
                except Exception:
                    json_data = {}

            try:
                try:
                    ds = await dataset_service.get(dataset_id)
                except FileNotFoundError:
                    ds = await dataset_service.create(dataset_id)
                await ds.set_metadata(
                    location=location,
                    description=description,
                    size=size,
                    json_data=json_data,
                )
                migrated += 1
            except Exception:
                # Best-effort migration; continue
                continue

        # Drop the legacy table if present
        try:
            async with async_session() as session:
                await session.execute(sqlalchemy_text("ALTER TABLE dataset RENAME TO zzz_archived_dataset"))
                await session.commit()
        except Exception:
            pass

        if migrated:
            print(f"Datasets migration completed: {migrated} entries migrated to filesystem store.")
    except Exception as e:
        # Do not block startup on migration issues
        print(f"Datasets migration skipped due to error: {e}")


async def migrate_models_table_to_filesystem():
    """
    One-time migration: copy rows from the legacy model DB table into the filesystem
    registry via transformerlab-sdk, then drop the table.
    Safe to run multiple times; it will no-op if table is missing or empty.
    """
    try:
        # Late import to avoid hard dependency during tests without DB
        from lab.dirs import get_models_dir
        from lab.model import Model as model_service
        from sqlalchemy import text as sqlalchemy_text
        from transformerlab.db.session import async_session

        models_dir = await get_models_dir()

        # Initialize the exists variable
        exists = False

        # Drop the pretrained folder if it exists in models directory
        if os.path.isdir(os.path.join(models_dir, "pretrained")):
            shutil.rmtree(os.path.join(models_dir, "pretrained"))

        # Read existing rows
        rows = []
        try:
            # First check if the table exists
            async with async_session() as session:
                result = await session.execute(
                    sqlalchemy_text("SELECT name FROM sqlite_master WHERE type='table' AND name='model'")
                )
                exists = result.fetchone() is not None
            if not exists:
                rows = []
            else:
                # Inline the legacy models query here to avoid relying on removed DB helpers
                async with async_session() as session:
                    result = await session.execute(sqlalchemy_text("SELECT * FROM model"))
                    models_rows = result.mappings().all()
                    dict_rows = [dict(model) for model in models_rows]
                    rows = []
                    for row in dict_rows:
                        if "json_data" in row and row["json_data"]:
                            if isinstance(row["json_data"], str):
                                try:
                                    row["json_data"] = json.loads(row["json_data"])
                                except Exception:
                                    # If malformed, keep as original string
                                    pass
                        rows.append(row)
        except Exception as e:
            print(f"Error getting models: {e}")
            rows = []
        migrated = 0
        for row in rows:
            model_id = str(row.get("model_id")) if row.get("model_id") is not None else None
            print(f"Migrating model: {model_id}")
            if not model_id:
                continue
            name = row.get("name", model_id)
            json_data = row.get("json_data", {})
            if isinstance(json_data, str):
                try:
                    json_data = json.loads(json_data)
                except Exception:
                    json_data = {}

            try:
                try:
                    model = await model_service.get(model_id)
                except FileNotFoundError:
                    model = await model_service.create(model_id)
                await model.set_metadata(
                    model_id=model_id,
                    name=name,
                    json_data=json_data,
                )
                migrated += 1
            except Exception as e:
                print(f"Error migrating model: {e}")
                # Best-effort migration; continue
                continue

        # Drop the legacy table if present
        if exists:
            try:
                async with async_session() as session:
                    await session.execute(sqlalchemy_text("ALTER TABLE model RENAME TO zzz_archived_model"))
                    await session.commit()
            except Exception as e:
                print(f"Error dropping models table: {e}")
                pass

        # Additionally, scan filesystem models directory for legacy models that
        # have info.json but are missing index.json, and create SDK metadata.
        try:
            from lab.dirs import get_models_dir

            models_dir = await get_models_dir()
            if os.path.isdir(models_dir):
                fs_migrated = 0
                for entry in os.listdir(models_dir):
                    entry_path = os.path.join(models_dir, entry)
                    if not os.path.isdir(entry_path):
                        continue
                    info_path = os.path.join(entry_path, "info.json")
                    index_path = os.path.join(entry_path, "index.json")
                    if os.path.isfile(info_path) and not os.path.isfile(index_path):
                        model_id = entry
                        # Load legacy info.json as best-effort metadata
                        name = model_id
                        json_data = {}
                        try:
                            with open(info_path, "r") as f:
                                info_obj = json.load(f)
                                if isinstance(info_obj, dict):
                                    name = info_obj.get("name", name)
                                    # Use the json_data from the legacy info.json directly
                                    json_data = info_obj.get("json_data", {})
                        except Exception:
                            # Skip malformed info.json but continue migration
                            pass

                        try:
                            try:
                                model = await model_service.get(model_id)
                            except FileNotFoundError:
                                model = await model_service.create(model_id)
                            await model.set_metadata(
                                model_id=model_id,
                                name=name,
                                json_data=json_data,
                            )
                            fs_migrated += 1
                        except Exception as e:
                            print(f"Error migrating local model: {e}")
                            # Best-effort; continue scanning others
                            continue

                if fs_migrated:
                    print(f"Filesystem models migration: {fs_migrated} entries created from info.json (no index.json).")
        except Exception as e:
            # Do not block startup on filesystem migration issues
            print(f"Error migrating models: {e}")
            pass

        if migrated:
            print(f"Models migration completed: {migrated} entries migrated to filesystem store.")
    except Exception as e:
        # Do not block startup on migration issues
        print(f"Models migration skipped due to error: {e}")


async def migrate_tasks_table_to_filesystem():
    """
    One-time migration: copy rows from the legacy tasks DB table into the filesystem
    registry via transformerlab-sdk, then drop the table.
    Safe to run multiple times; it will no-op if table is missing or empty.
    """
    try:
        # Late import to avoid hard dependency during tests without DB
        from sqlalchemy import text as sqlalchemy_text
        from transformerlab.db.session import async_session

        # Read existing rows
        rows = []
        try:
            # First check if the table exists
            async with async_session() as session:
                result = await session.execute(
                    sqlalchemy_text("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
                )
                exists = result.fetchone() is not None
            if not exists:
                return
            # Migrate db.tasks_get_all() to run here as we are deleting that code
            rows = []
            async with async_session() as session:
                result = await session.execute(sqlalchemy_text("SELECT * FROM tasks"))
                tasks = result.mappings().all()
                dict_rows = [dict(task) for task in tasks]
                for row in dict_rows:
                    # Handle JSON fields that might be strings
                    for json_field in ["inputs", "config", "outputs"]:
                        if json_field in row and row[json_field]:
                            if isinstance(row[json_field], str):
                                try:
                                    row[json_field] = json.loads(row[json_field])
                                except Exception:
                                    # If malformed, keep as original string or empty dict
                                    row[json_field] = {}
                    rows.append(row)
        except Exception as e:
            print(f"Failed to read tasks for migration: {e}")
            rows = []

        # Get experiments mapping to convert numeric IDs to names
        experiments_map = {}
        try:
            async with async_session() as session:
                result = await session.execute(
                    sqlalchemy_text("SELECT name FROM sqlite_master WHERE type='table' AND name='experiment'")
                )
                experiments_table_exists = result.fetchone() is not None

                if experiments_table_exists:
                    result = await session.execute(sqlalchemy_text("SELECT * FROM experiment"))
                    experiments = result.mappings().all()
                    for exp in experiments:
                        experiments_map[str(exp["id"])] = exp["name"]
        except Exception as e:
            print(f"Could not get experiments mapping: {e}")

        migrated = 0
        for row in rows:
            task_id = str(row.get("id")) if row.get("id") is not None else None
            if not task_id:
                continue

            name = row.get("name", "")
            task_type = row.get("type", "")
            inputs = row.get("inputs", {})
            config = row.get("config", {})
            plugin = row.get("plugin", "")
            outputs = row.get("outputs", {})
            experiment_id = row.get("experiment_id")
            created_at = row.get("created_at")
            updated_at = row.get("updated_at")

            # Convert numeric experiment_id to experiment name if needed
            if experiment_id and str(experiment_id).isdigit():
                experiment_name = experiments_map.get(str(experiment_id))
                if experiment_name:
                    experiment_id = experiment_name
                    print(
                        f"Converting task {task_id} experiment_id from {row.get('experiment_id')} to {experiment_name}"
                    )

            try:
                try:
                    task = await task_service.get(task_id)
                except FileNotFoundError:
                    task = await task_service.create(task_id)

                await task.set_metadata(
                    name=name,
                    type=task_type,
                    inputs=inputs,
                    config=config,
                    plugin=plugin,
                    outputs=outputs,
                    experiment_id=experiment_id,
                )

                # Set the timestamps manually since they come from the database
                metadata = await task.get_metadata()
                if created_at:
                    metadata["created_at"] = (
                        created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
                    )
                if updated_at:
                    metadata["updated_at"] = (
                        updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at)
                    )
                await task._set_json_data(metadata)

                migrated += 1
            except Exception as e:
                print(f"Error migrating task {task_id}: {e}")
                # Best-effort migration; continue
                continue

        # Drop the legacy table if present
        try:
            async with async_session() as session:
                await session.execute(sqlalchemy_text("ALTER TABLE tasks RENAME TO zzz_archived_tasks"))
                await session.commit()
        except Exception:
            pass

        if migrated:
            print(f"Tasks migration completed: {migrated} entries migrated to filesystem store.")
    except Exception as e:
        # Do not block startup on migration issues
        print(f"Tasks migration skipped due to error: {e}")


async def migrate_jobs():
    """Migrate jobs from DB to filesystem"""
    try:
        # Late import to avoid hard dependency during tests without DB
        from transformerlab.db.session import async_session
        from sqlalchemy import text as sqlalchemy_text

        print("Migrating jobs...")

        # Read existing job rows from DB using raw SQL (like dataset migration)
        jobs_rows = []
        experiments_map = {}  # Map experiment_id to experiment_name
        try:
            # First check if the jobs table exists
            async with async_session() as session:
                result = await session.execute(
                    sqlalchemy_text("SELECT name FROM sqlite_master WHERE type='table' AND name='job'")
                )
                jobs_table_exists = result.fetchone() is not None

                # Also check if experiments table exists to get the name mapping
                result = await session.execute(
                    sqlalchemy_text(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='zzz_archived_experiment'"
                    )
                )
                experiments_table_exists = result.fetchone() is not None

            if not jobs_table_exists:
                print("No jobs table found, skipping jobs migration.")
                return

            # Get experiments mapping first (can't use experiment_get_all() as it might be deleted)
            if experiments_table_exists:
                async with async_session() as session:
                    result = await session.execute(sqlalchemy_text("SELECT * FROM zzz_archived_experiment"))
                    experiments = result.mappings().all()
                    for exp in experiments:
                        # Ensure consistent string keys for mapping
                        experiments_map[str(exp["id"])] = exp["name"]
            # Get all jobs using raw SQL (can't use jobs_get_by_experiment() as it might be deleted)
            async with async_session() as session:
                result = await session.execute(sqlalchemy_text("SELECT * FROM job"))
                jobs = result.mappings().all()
                dict_jobs = [dict(job) for job in jobs]
                for job in dict_jobs:
                    # Handle job_data JSON inconsistency (might be string or dict)
                    if "job_data" in job and job["job_data"]:
                        if isinstance(job["job_data"], str):
                            try:
                                job["job_data"] = json.loads(job["job_data"])
                            except json.JSONDecodeError:
                                job["job_data"] = {}
                    jobs_rows.append(job)
        except Exception as e:
            print(f"Failed to read jobs for migration: {e}")
            jobs_rows = []

        if not jobs_rows:
            print("No jobs found in DB to migrate.")
            return

        # Move existing jobs directory to temp if it exists
        # We do this because the SDK's create() method will fail if directories already exist, so we temporarily move
        # the existing directories aside, let the SDK create clean directories with proper structure,
        # then copy back all the existing files (preserving user data like logs, configs, etc.)
        temp_jobs_dir = None
        jobs_dir = await lab_dirs.get_jobs_dir()
        if os.path.exists(jobs_dir):
            temp_jobs_dir = f"{jobs_dir}_migration_temp"
            print(f"Moving existing jobs directory to: {temp_jobs_dir}")
            os.rename(jobs_dir, temp_jobs_dir)

        migrated = 0
        for job in jobs_rows:
            # Get experiment name from mapping
            experiment_id = job.get("experiment_id")
            if experiment_id is None or experiment_id == -1:
                experiment_name = "unknown"
            else:
                experiment_name = experiments_map.get(str(experiment_id))

            try:
                # Create SDK Job
                job_obj = await Job.create(job["id"])
                # Update the JSON data with DB data
                await job_obj._update_json_data_field(key="id", value=job["id"])
                await job_obj._update_json_data_field(
                    key="experiment_id", value=experiment_name
                )  # Use name instead of numeric ID
                await job_obj._update_json_data_field(key="job_data", value=job.get("job_data", {}))
                await job_obj._update_json_data_field(key="status", value=job["status"])
                await job_obj._update_json_data_field(key="type", value=job["type"])
                await job_obj._update_json_data_field(key="progress", value=job.get("progress"))

                # Copy existing files from temp directory if they exist
                # This preserves all user data (logs, configs, outputs, etc.) that was in the
                # original job directories while maintaining the new SDK structure
                if temp_jobs_dir:
                    old_job_dir = os.path.join(temp_jobs_dir, str(job["id"]))
                    if os.path.exists(old_job_dir):
                        new_job_dir = await job_obj.get_dir()
                        # Copy all files except index.json (which we just created)
                        for item in os.listdir(old_job_dir):
                            src = os.path.join(old_job_dir, item)
                            dst = os.path.join(new_job_dir, item)
                            if os.path.isdir(src):
                                shutil.copytree(src, dst, dirs_exist_ok=True)
                            else:
                                shutil.copy2(src, dst)
                    else:
                        # Job not found in jobs directory, check if it's in the wrong place
                        # (experiments/{experiment_name}/jobs/{job_id}) from the last month
                        temp_experiments_dir = f"{await lab_dirs.get_experiments_dir()}_migration_temp"
                        if os.path.exists(temp_experiments_dir):
                            wrong_place_job_dir = os.path.join(
                                temp_experiments_dir, str(experiment_name), "jobs", str(job["id"])
                            )
                            if os.path.exists(wrong_place_job_dir):
                                new_job_dir = await job_obj.get_dir()
                                # Copy all files except index.json (which we just created)
                                for item in os.listdir(wrong_place_job_dir):
                                    src = os.path.join(wrong_place_job_dir, item)
                                    dst = os.path.join(new_job_dir, item)
                                    if os.path.isdir(src):
                                        shutil.copytree(src, dst, dirs_exist_ok=True)
                                    else:
                                        shutil.copy2(src, dst)

                migrated += 1
            except Exception:
                # Best-effort migration; continue
                continue

        # Clean up temp directory
        if temp_jobs_dir and os.path.exists(temp_jobs_dir):
            print(f"Cleaning up temp jobs directory: {temp_jobs_dir}")
            shutil.rmtree(temp_jobs_dir)

        # Clean up temp experiments directory if it was used for job migration
        temp_experiments_dir = f"{await lab_dirs.get_experiments_dir()}_migration_temp"
        if os.path.exists(temp_experiments_dir):
            print(f"Cleaning up temp experiments directory after job migration: {temp_experiments_dir}")
            shutil.rmtree(temp_experiments_dir)

        # Archive the legacy jobs table if present
        try:
            async with async_session() as session:
                await session.execute(sqlalchemy_text("ALTER TABLE job RENAME TO zzz_archived_job"))
                await session.commit()
        except Exception:
            pass

        if migrated:
            print(f"Jobs migration completed: {migrated} entries migrated to filesystem store.")

    except Exception as e:
        # Do not block startup on migration issues
        print(f"Jobs migration skipped due to error: {e}")


async def migrate_experiments():
    """Migrate experiments from DB to filesystem."""
    try:
        # Late import to avoid hard dependency during tests without DB
        from transformerlab.db.session import async_session
        from sqlalchemy import text as sqlalchemy_text

        print("Migrating experiments...")

        # Read existing experiment rows from DB using raw SQL
        experiments_rows = []
        try:
            # First check if the experiments table exists
            async with async_session() as session:
                result = await session.execute(
                    sqlalchemy_text("SELECT name FROM sqlite_master WHERE type='table' AND name='experiment'")
                )
                exists = result.fetchone() is not None
            if not exists:
                print("No experiments table found, skipping experiments migration.")
                return

            # Get all experiments using raw SQL (can't use experiment_get_all() as it might be deleted)
            async with async_session() as session:
                result = await session.execute(sqlalchemy_text("SELECT * FROM experiment"))
                experiments = result.mappings().all()
                dict_experiments = [dict(experiment) for experiment in experiments]
                for exp in dict_experiments:
                    # Handle config JSON inconsistency (like dataset migration)
                    if "config" in exp and exp["config"]:
                        if isinstance(exp["config"], str):
                            try:
                                exp["config"] = json.loads(exp["config"])
                            except json.JSONDecodeError:
                                exp["config"] = {}
                    experiments_rows.append(exp)
        except Exception as e:
            print(f"Failed to read experiments for migration: {e}")
            experiments_rows = []

        if not experiments_rows:
            print("No experiments found in DB to migrate.")
            return

        # Move existing experiments directory to temp if it exists
        # We do this because the SDK's create() method will fail if
        # directories already exist, so we temporarily move the existing directories aside, let the
        # SDK create clean directories with proper structure, then copy back all the existing files
        # (preserving user data like models, datasets, configs, etc.)
        temp_experiments_dir = None
        experiments_dir = await lab_dirs.get_experiments_dir()
        if os.path.exists(experiments_dir):
            temp_experiments_dir = f"{experiments_dir}_migration_temp"
            print(f"Moving existing experiments directory to: {temp_experiments_dir}")
            os.rename(experiments_dir, temp_experiments_dir)

        migrated = 0
        for exp in experiments_rows:
            try:
                # Create SDK Experiment
                experiment = await Experiment.create(exp["name"])
                # Update the JSON data with DB data
                await experiment._update_json_data_field(key="id", value=exp["name"])
                await experiment._update_json_data_field(key="db_experiment_id", value=exp["id"])
                await experiment._update_json_data_field(key="config", value=exp.get("config", {}))
                await experiment._update_json_data_field(
                    key="created_at", value=exp.get("created_at", datetime.now().isoformat())
                )
                await experiment._update_json_data_field(
                    key="updated_at", value=exp.get("updated_at", datetime.now().isoformat())
                )

                # Copy existing files from temp directory if they exist
                # This preserves all user data (models, datasets, configs, etc.) that was in the
                # original experiment directories while maintaining the new SDK structure
                if temp_experiments_dir:
                    old_experiment_dir = os.path.join(temp_experiments_dir, exp["name"])
                    if os.path.exists(old_experiment_dir):
                        new_experiment_dir = await experiment.get_dir()
                        for item in os.listdir(old_experiment_dir):
                            src = os.path.join(old_experiment_dir, item)
                            dst = os.path.join(new_experiment_dir, item)
                            if os.path.isdir(src):
                                shutil.copytree(src, dst, dirs_exist_ok=True)
                            else:
                                shutil.copy2(src, dst)

                migrated += 1
            except Exception:
                # Best-effort migration; continue
                continue

        # Clean up temp directory
        if temp_experiments_dir and os.path.exists(temp_experiments_dir):
            print(f"Cleaning up temp experiments directory: {temp_experiments_dir}")
            shutil.rmtree(temp_experiments_dir)

        # Archive the legacy experiments table if present
        try:
            async with async_session() as session:
                await session.execute(sqlalchemy_text("ALTER TABLE experiment RENAME TO zzz_archived_experiment"))
                await session.commit()
        except Exception:
            pass

        if migrated:
            print(f"Experiments migration completed: {migrated} entries migrated to filesystem store.")

    except Exception as e:
        # Do not block startup on migration issues
        print(f"Experiments migration skipped due to error: {e}")


async def migrate_job_and_experiment_to_filesystem():
    """Migrate data from DB to filesystem if not already migrated."""

    try:
        # Late import to avoid hard dependency during tests without DB
        from transformerlab.db.session import async_session
        from sqlalchemy import text as sqlalchemy_text

        # Check if migration is needed by looking for the existence of old database tables
        experiments_need_migration = False
        jobs_need_migration = False

        try:
            async with async_session() as session:
                # Check if experiments table exists
                result = await session.execute(
                    sqlalchemy_text("SELECT name FROM sqlite_master WHERE type='table' AND name='experiment'")
                )
                experiments_need_migration = result.fetchone() is not None

                # Check if jobs table exists
                result = await session.execute(
                    sqlalchemy_text("SELECT name FROM sqlite_master WHERE type='table' AND name='job'")
                )
                jobs_need_migration = result.fetchone() is not None
        except Exception as e:
            print(f"Failed to check for migration tables: {e}")
            return

        # If neither needs migration, skip entirely
        if not experiments_need_migration and not jobs_need_migration:
            print("No migration needed - tables not found.")
            return
        else:
            if experiments_need_migration:
                await migrate_experiments()
            if jobs_need_migration:
                await migrate_jobs()

    except Exception as e:
        print(f"Error during migration: {e}")
        # Do not block startup on migration issues
        pass
