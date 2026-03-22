"""
model_service.py

Service layer for working with models.
"""

from transformerlab.models import localmodel


async def list_installed_models(embedding: bool = False) -> list:
    """
    Legacy function for getting a list of models from all sources.
    """
    return await localmodel.LocalModelStore().list_models(embedding)


async def list_model_provenance(model_id: str) -> list:
    """
    Return a list of the provenance of a model with the unique ID model_id.
    """
    return await localmodel.LocalModelStore().list_model_provenance(model_id)
