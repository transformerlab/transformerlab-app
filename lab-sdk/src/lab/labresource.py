from abc import ABC, abstractmethod
import json
from . import storage


class BaseLabResource(ABC):
    """
    Base object for all other resources to inherit from.

    This wraps the standard file-system structure and internal access functions.
    Lab resources have an associated directory and a json file with metadata.
    """

    def __init__(self, id):
        self.id = id

    @abstractmethod
    def get_dir(self) -> str:
        """Get file system directory where this resource is stored."""
        pass

    @classmethod
    def create(cls, id):
        """
        Default method to create a new entity and initialize it with defualt metadata.
        """
        newobj = cls(id)
        newobj._initialize()
        return newobj

    @classmethod
    def get(cls, id):
        """
        Default method to get entity if it exists in the file system.
        If the entity's directory doesn't exist then throw an error.
        If the entity's metadata file does not exist then create a default.
        """
        newobj = cls(id)
        resource_dir = newobj.get_dir()
        if not storage.isdir(resource_dir):
            raise FileNotFoundError(f"Directory for {cls.__name__} with id '{id}' not found")
        json_file = newobj._get_json_file()
        if not storage.exists(json_file):
            with storage.open(json_file, "w", encoding="utf-8") as f:
                json.dump(newobj._default_json(), f)
        return newobj

    ###
    # INTERNAL METHODS
    # There are used by all subclasses to initialize, get and set JSON data
    ###

    def _initialize(self):
        """
        Default function to initialize the file system and json object.
        To alter the default metadata update the _default_json method.
        """

        # Create directory for this resource
        dir = self.get_dir()
        storage.makedirs(dir, exist_ok=True)
        print(f"Created directory for {type(self).__name__} with id '{self.id}'")

        # Create a default json file. Throw an error if one already exists.
        json_file = self._get_json_file()
        if storage.exists(json_file):
            raise FileExistsError(f"{type(self).__name__} with id '{self.id}' already exists")
        with storage.open(json_file, "w", encoding="utf-8") as f:
            json.dump(self._default_json(), f)

    def _default_json(self):
        """Override in subclasses to support the initialize method."""
        return {"id": self.id}

    def _get_json_file(self):
        """Get json file containing metadata for this resource."""
        return storage.join(self.get_dir(), "index.json")

    def get_json_data(self, uncached: bool = False):
        """
        Return the JSON data that is stored for this resource in the filesystem.
        If the file doesn't exist then return an empty dict.

        Args:
            uncached: If True, use an uncached filesystem to avoid Etag caching issues
        """

        json_file = self._get_json_file()

        # Try opening this file location and parsing the json inside
        # On any error return an empty dict
        try:
            with storage.open(json_file, "r", encoding="utf-8", uncached=uncached) as f:
                content = f.read()
                # Clean the content - remove trailing whitespace and extra characters
                content = content.strip()
                # Remove any trailing % characters (common in some shell outputs)
                content = content.rstrip("%")
                content = content.strip()
                return json.loads(content)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _set_json_data(self, json_data):
        """
        Sets the entire JSON data that is stored for this resource in the filesystem.
        This will overwrite whatever is stored now.
        If the file doesn't exist it will be created.

        Throws:
        TypeError if json_data is not of type dict
        """
        if not isinstance(json_data, dict):
            raise TypeError("json_data must be a dict")

        # Write directly to index.json
        json_file = self._get_json_file()
        with storage.open(json_file, "w", encoding="utf-8") as f:
            json.dump(json_data, f, ensure_ascii=False)

    def _get_json_data_field(self, key, default=""):
        """Gets the value of a single top-level field in a JSON object"""
        json_data = self.get_json_data()
        return json_data.get(key, default)

    def _update_json_data_field(self, key: str, value):
        """Sets the value of a single top-level field in a JSON object"""
        json_data = self.get_json_data()
        json_data[key] = value
        self._set_json_data(json_data)

    def delete(self):
        """
        Delete this resource by deleting the containing directory.
        TODO: We should change to soft delete
        """
        resource_dir = self.get_dir()
        if storage.exists(resource_dir):
            storage.rm_tree(resource_dir)
