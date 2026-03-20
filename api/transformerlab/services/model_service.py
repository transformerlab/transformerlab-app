"""
model_service.py

Service layer for working with models.
"""

from transformerlab.models import localmodel


async def list_installed_models(embedding: bool = False) -> list:
    """
    Check both the DB and the workspace models directory and return a list of models
    in the format that models are stored in the DB.
    """
    return await localmodel.LocalModelStore().list_models(embedding)


async def is_model_installed(model_id: str) -> bool:
    """
    Return True if a model with the unique ID model_id is downloaded to the DB
    or Transformer Lab workspace.
    """
    return await localmodel.LocalModelStore().has_model(model_id)


async def list_model_provenance(model_id: str) -> list:
    """
    Return a list of the provenance of a model with the unique ID model_id.
    """
    return await localmodel.LocalModelStore().list_model_provenance(model_id)
