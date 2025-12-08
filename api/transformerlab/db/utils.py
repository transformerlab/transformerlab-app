"""
Utilities for working with SQLAlchemy objects
"""

import json

from sqlalchemy.inspection import inspect


def sqlalchemy_to_dict(obj):
    """
    Convert a SQLAlchemy object to a dictionary, excluding SQLAlchemy internal attributes.

    This function specifically excludes the '_sa_instance_state' attribute and other
    SQLAlchemy internal attributes that can cause issues during serialization.
    It also excludes timestamp fields like 'created_at' and 'updated_at'.

    Args:
        obj: SQLAlchemy model instance

    Returns:
        dict: Dictionary representation of the object without SQLAlchemy internals
    """
    if obj is None:
        return None

    # Fields to exclude from the dictionary
    excluded_fields = {"created_at", "updated_at"}

    # Get the mapper for this object
    mapper = inspect(obj.__class__)

    # Create a dictionary with only the mapped columns, excluding specified fields
    result = {}
    for column in mapper.columns:
        if column.name not in excluded_fields:
            value = getattr(obj, column.name)
            result[column.name] = value

            # If the column is of type JSON, convert its value to a JSON string
            if hasattr(column.type, "python_type") and column.type.python_type is dict:
                if isinstance(value, dict):
                    result[column.name] = json.dumps(value)

    return result


def sqlalchemy_list_to_dict(objects):
    """
    Convert a list of SQLAlchemy objects to a list of dictionaries.

    Args:
        objects: List of SQLAlchemy model instances

    Returns:
        list: List of dictionaries without SQLAlchemy internals
    """
    return [sqlalchemy_to_dict(obj) for obj in objects]
