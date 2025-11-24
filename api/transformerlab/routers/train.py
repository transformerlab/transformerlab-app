import subprocess

from fastapi import APIRouter
import transformerlab.services.job_service as job_service
from lab import Experiment, storage

from werkzeug.utils import secure_filename

# @TODO hook this up to an endpoint so we can cancel a finetune


def abort_fine_tune():
    print("Aborting training...")
    return "abort"


router = APIRouter(prefix="/train", tags=["train"])


# @router.post("/finetune_lora")
# def finetune_lora(
#     model: str,
#     adaptor_name: str,
#     text: Annotated[str, Body()],
#     background_tasks: BackgroundTasks,
# ):
#     background_tasks.add_task(finetune, model, text, adaptor_name)

#     return {"message": "OK"}


# @router.post("/template/create")
# async def create_training_template(
#     name: str,
#     description: str,
#     type: str,
#     config: Annotated[str, Body(embed=True)],
# ):
#     configObject = json.loads(config)
#     datasets = configObject["dataset_name"]
#     await db.create_training_template(name, description, type, datasets, config)
#     return {"message": "OK"}


# @router.get("/templates")
# async def get_training_templates():
#     return await db.get_training_templates()


# @router.get("/template/{template_id}/delete")
# async def delete_training_template(template_id: str):
#     await db.delete_training_template(template_id)
#     return {"message": "OK"}


tensorboard_process = None


@router.get("/tensorboard/stop")
async def stop_tensorboard():
    global tensorboard_process

    if tensorboard_process:
        print("Stopping Tensorboard")
        tensorboard_process.terminate()
    return {"message": "OK"}


@router.get("/tensorboard/start")
async def start_tensorboard(job_id: str):
    await spawn_tensorboard(job_id)
    return {"message": "OK"}


async def spawn_tensorboard(job_id: str):
    global tensorboard_process

    # call stop to ensure that if there is thread running we kill it first
    # otherwise it will dangle and we won't be able to grab the port
    await stop_tensorboard()

    print("Starting tensorboard")

    job = job_service.job_get(job_id)
    # First get the experiment name from the job
    experiment_id = job["experiment_id"]
    exp_obj = Experiment(experiment_id)
    experiment_dir = exp_obj.get_dir()
    job_data = job["job_data"]

    if "template_name" not in job_data.keys():
        raise ValueError("Template Name not found in job data")

    template_name = job_data["template_name"]
    template_name = secure_filename(template_name)

    logdir = storage.join(experiment_dir, "tensorboards", template_name)
    storage.makedirs(logdir, exist_ok=True)

    tensorboard_process = subprocess.Popen(["tensorboard", "--logdir", logdir, "--host", "0.0.0.0"])
