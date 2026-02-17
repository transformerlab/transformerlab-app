from .dirs import WORKSPACE_DIR, HOME_DIR
from .job import Job
from .experiment import Experiment
from .model import Model
from .dataset import Dataset
from .generation import GenerationModel, load_generation_model
from .task import Task
from .task_template import TaskTemplate

from .lab_facade import Lab

# Provide a convenient singleton facade for simple usage
lab = Lab()

__all__ = [
    "WORKSPACE_DIR",
    "HOME_DIR",
    Job,
    Experiment,
    Model,
    Dataset,
    GenerationModel,
    "load_generation_model",
    Task,
    TaskTemplate,
    "lab",
    "Lab",
]
