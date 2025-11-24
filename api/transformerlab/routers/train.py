import subprocess

from fastapi import APIRouter
import transformerlab.services.job_service as job_service
from lab import Experiment, storage

from werkzeug.utils import secure_filename


router = APIRouter(prefix="/train", tags=["train"])


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
