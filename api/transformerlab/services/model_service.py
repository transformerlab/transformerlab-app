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
