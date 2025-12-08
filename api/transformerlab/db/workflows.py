#################
# WORKFLOWS MODEL
#################
import json

from sqlalchemy import delete, select, text, update

from transformerlab.db.session import async_session
from transformerlab.db.utils import sqlalchemy_list_to_dict, sqlalchemy_to_dict
from transformerlab.shared.models import models


async def workflows_get_all():
    async with async_session() as session:
        result = await session.execute(
            select(models.Workflow)
            .where(models.Workflow.status != "DELETED")
            .order_by(models.Workflow.created_at.desc())
        )
        workflows = result.scalars().all()
        # Convert ORM objects to dicts
        return sqlalchemy_list_to_dict(workflows)


async def workflows_get_from_experiment(experiment_id):
    async with async_session() as session:
        result = await session.execute(
            select(models.Workflow)
            .where(
                models.Workflow.experiment_id == experiment_id,
                models.Workflow.status != "DELETED",
            )
            .order_by(models.Workflow.created_at.desc())
        )
        workflows = result.scalars().all()
        workflow_list = sqlalchemy_list_to_dict(workflows)
        # Make sure that the configs for each workflow are strings
        for workflow in workflow_list:
            workflow_config = workflow.get("config", "")
            if isinstance(workflow_config, dict):
                workflow["config"] = json.dumps(workflow_config)

        return workflow_list


async def workflow_run_get_all():
    async with async_session() as session:
        result = await session.execute(
            select(models.WorkflowRun)
            .where(models.WorkflowRun.status != "DELETED")
            .order_by(models.WorkflowRun.created_at.desc())
        )
        workflow_runs = result.scalars().all()
        # Convert ORM objects to dicts
        return sqlalchemy_list_to_dict(workflow_runs)


async def workflows_get_by_id(workflow_id, experiment_id):
    async with async_session() as session:
        result = await session.execute(
            select(models.Workflow)
            .where(
                models.Workflow.id == workflow_id,
                models.Workflow.experiment_id == experiment_id,
                models.Workflow.status != "DELETED",
            )
            .order_by(models.Workflow.created_at.desc())
            .limit(1)
        )
        workflow = result.scalar_one_or_none()
        if workflow is None:
            return None
        return sqlalchemy_to_dict(workflow)


async def workflow_run_get_by_id(workflow_run_id):
    async with async_session() as session:
        result = await session.execute(
            select(models.WorkflowRun)
            .where(models.WorkflowRun.id == workflow_run_id)
            .order_by(models.WorkflowRun.created_at.desc())
            .limit(1)
        )
        workflow_run = result.scalar_one_or_none()
        if workflow_run is None:
            return None
        return sqlalchemy_to_dict(workflow_run)


async def workflow_delete_by_id(workflow_id: str, experiment_id):
    print("Deleting workflow: " + str(workflow_id))
    async with async_session() as session:
        result = await session.execute(
            update(models.Workflow)
            .where(
                models.Workflow.id == workflow_id, models.Workflow.experiment_id == experiment_id
            )
            .values(status="DELETED", updated_at=text("CURRENT_TIMESTAMP"))
        )
        await session.commit()
        return result.rowcount > 0


async def workflow_delete_by_name(workflow_name):
    print("Deleting workflow: " + workflow_name)
    async with async_session() as session:
        result = await session.execute(
            update(models.Workflow)
            .where(models.Workflow.name == workflow_name)
            .values(status="DELETED", updated_at=text("CURRENT_TIMESTAMP"))
        )
        await session.commit()
        return result.rowcount > 0


async def workflow_count_running():
    async with async_session() as session:
        result = await session.execute(
            select(models.WorkflowRun).where(models.WorkflowRun.status == "RUNNING")
        )
        count = len(result.scalars().all())
        return count


async def workflow_count_queued():
    async with async_session() as session:
        result = await session.execute(
            select(models.WorkflowRun).where(models.WorkflowRun.status == "QUEUED")
        )
        count = len(result.scalars().all())
        return count


async def workflow_run_get_running():
    async with async_session() as session:
        result = await session.execute(
            select(models.WorkflowRun)
            .where(models.WorkflowRun.status == "RUNNING")
            .order_by(models.WorkflowRun.created_at.asc())
            .limit(1)
        )
        workflow_run = result.scalar_one_or_none()
        if workflow_run is None:
            return None
        return sqlalchemy_to_dict(workflow_run)


async def workflow_run_get_queued():
    async with async_session() as session:
        result = await session.execute(
            select(models.WorkflowRun)
            .where(models.WorkflowRun.status == "QUEUED")
            .order_by(models.WorkflowRun.created_at.asc())
            .limit(1)
        )
        workflow_run = result.scalar_one_or_none()
        if workflow_run is None:
            return None
        return sqlalchemy_to_dict(workflow_run)


async def workflow_run_update_status(workflow_run_id, status):
    async with async_session() as session:
        await session.execute(
            update(models.WorkflowRun)
            .where(models.WorkflowRun.id == workflow_run_id)
            .values(status=status, updated_at=text("CURRENT_TIMESTAMP"))
        )
        await session.commit()
    return


async def workflow_run_update_with_new_job(workflow_run_id, current_task, current_job_id):
    """
    Update the workflow run with new current_task and current_job_id,
    and append them to node_ids and job_ids lists.
    """
    async with async_session() as session:
        # Fetch the workflow run
        result = await session.execute(
            select(models.WorkflowRun).where(models.WorkflowRun.id == workflow_run_id)
        )
        workflow_run = result.scalar_one_or_none()
        if workflow_run is None:
            return

        # Update current_tasks and current_job_ids
        workflow_run.current_tasks = current_task
        workflow_run.current_job_ids = current_job_id

        # Update job_ids list
        existing_job_ids = json.loads(workflow_run.job_ids or "[]")
        new_job_ids = json.loads(current_job_id or "[]")
        updated_job_ids = existing_job_ids + new_job_ids
        workflow_run.job_ids = json.dumps(updated_job_ids)

        # Update node_ids list
        existing_node_ids = json.loads(workflow_run.node_ids or "[]")
        new_node_ids = json.loads(current_task or "[]")
        updated_node_ids = existing_node_ids + new_node_ids
        workflow_run.node_ids = json.dumps(updated_node_ids)

        await session.commit()
    return


async def workflow_create(name, config, experiment_id):
    async with async_session() as session:
        workflow = models.Workflow(
            name=name,
            config=config,
            status="CREATED",
            experiment_id=experiment_id,
        )
        session.add(workflow)
        await session.commit()
        await session.refresh(workflow)
        return workflow.id


async def workflow_update_config(workflow_id, config, experiment_id):
    async with async_session() as session:
        result = await session.execute(
            update(models.Workflow)
            .where(
                models.Workflow.id == workflow_id, models.Workflow.experiment_id == experiment_id
            )
            .values(config=config, updated_at=text("CURRENT_TIMESTAMP"))
        )
        await session.commit()
        return result.rowcount > 0


async def workflow_update_name(workflow_id, name, experiment_id):
    async with async_session() as session:
        result = await session.execute(
            update(models.Workflow)
            .where(
                models.Workflow.id == workflow_id, models.Workflow.experiment_id == experiment_id
            )
            .values(name=name, updated_at=text("CURRENT_TIMESTAMP"))
        )
        await session.commit()
        return result.rowcount > 0


async def workflow_delete_all():
    async with async_session() as session:
        await session.execute(delete(models.Workflow))
        await session.commit()


async def workflow_runs_delete_all():
    async with async_session() as session:
        await session.execute(delete(models.WorkflowRun))
        await session.commit()


async def workflow_queue(workflow_id):
    async with async_session() as session:
        # Get workflow data using SQLAlchemy
        result = await session.execute(
            select(models.Workflow)
            .where(models.Workflow.id == workflow_id, models.Workflow.status != "DELETED")
            .limit(1)
        )
        workflow = result.scalar_one_or_none()

        if workflow:
            workflow_name = workflow.name
            experiment_id = workflow.experiment_id
            workflow_run = models.WorkflowRun(
                workflow_id=workflow_id,
                workflow_name=workflow_name,
                job_ids="[]",
                node_ids="[]",
                status="QUEUED",
                current_tasks="[]",
                current_job_ids="[]",
                experiment_id=experiment_id,
            )
            session.add(workflow_run)
            await session.commit()
            return True

        return False


async def workflow_runs_get_from_experiment(experiment_id):
    async with async_session() as session:
        result = await session.execute(
            select(models.WorkflowRun)
            .where(
                models.WorkflowRun.experiment_id == experiment_id,
                models.WorkflowRun.status != "DELETED",
            )
            .order_by(models.WorkflowRun.created_at.desc())
        )
        workflow_runs = result.scalars().all()
        return sqlalchemy_list_to_dict(workflow_runs)


async def workflow_run_delete(workflow_run_id):
    """Soft delete a workflow run by setting status to DELETED"""
    async with async_session() as session:
        await session.execute(
            update(models.WorkflowRun)
            .where(models.WorkflowRun.id == workflow_run_id)
            .values(status="DELETED")
        )
        await session.commit()
    return
