"""
model_helper.py

Common functions for working with models from various sources.

Most parts of the API will just use this helper and probably
don't have to interact directly with the source and model classes.
"""

from transformerlab.models import ollamamodel
from transformerlab.models import huggingfacemodel

import traceback


###
# EXTERNAL MODEL SOURCE WRAPPER FUNCTIONS
#
# These functions get used primarily when importing models.
###


def list_model_sources():
    """
    Supported strings that can be passsed as model_source
    to the functons that follow.
    """
    return ["huggingface", "ollama"]


def get_model_by_source_id(model_source: str, model_source_id: str):
    """
    Get a model from a model_source.
    model_source needs to be one of the strings returned by list_model_sources.
    model_source_id is the ID for that model internal to the model_source.
    """

    try:
        match model_source:
            case "ollama":
                return ollamamodel.OllamaModel(model_source_id)
            case "huggingface":
                return huggingfacemodel.HuggingFaceModel(model_source_id)
    except Exception:
        print(f"Caught exception getting model {model_source_id} from {model_source}:")
        traceback.print_exc()
    return None


async def list_models_from_source(model_source: str):
    """
    Get a list of models available at model_source.
    model_source needs to be one of the strings returned by list_model_sources.
    """
    try:
        match model_source:
            case "ollama":
                return await ollamamodel.list_models()
            case "huggingface":
                return await huggingfacemodel.list_models()
    except Exception:
        print(f"Caught exception listing models from {model_source}:")
        traceback.print_exc()
    return []
