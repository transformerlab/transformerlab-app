import json
import os

import pytest
from jsonschema import ValidationError, validate

# Get the directory of the current script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load the schema using a relative path
SCHEMA_PATH = os.path.join(BASE_DIR, "plugin.schema.json")
with open(SCHEMA_PATH) as schema_file:
    SCHEMA = json.load(schema_file)

# Define the base directory for plugins using a relative path
PLUGINS_DIR = os.path.join(BASE_DIR, "../../transformerlab/plugins")


def find_index_json_files(base_dir):
    """Find all index.json files in the first level of each folder under the given directory."""
    for entry in os.scandir(base_dir):
        if entry.is_dir():
            index_file = os.path.join(entry.path, "index.json")
            if os.path.isfile(index_file):
                yield index_file


@pytest.mark.parametrize("index_json_path", find_index_json_files(PLUGINS_DIR))
def test_validate_index_json(index_json_path):
    """Validate each index.json file against the schema."""
    with open(index_json_path) as json_file:
        try:
            data = json.load(json_file)
            validate(instance=data, schema=SCHEMA)
        except ValidationError as e:
            pytest.fail(f"Validation failed for {index_json_path}: {e.message}")
        except json.JSONDecodeError as e:
            pytest.fail(f"Invalid JSON in {index_json_path}: {e.msg}")
