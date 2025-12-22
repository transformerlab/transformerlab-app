from .dirs import WORKSPACE_DIR, HOME_DIR
from .job import Job
from .experiment import Experiment
from .model import Model
from .dataset import Dataset
from .task import Task
from .template import Template

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
    Task,
    Template,
    "lab",
    "Lab",
]
