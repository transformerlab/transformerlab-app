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
    async def create(cls, id):
        """
        Default method to create a new entity and initialize it with defualt metadata.
        """
        newobj = cls(id)
        await newobj._initialize()
        return newobj

    @classmethod
    async def get(cls, id):
        """
        Default method to get entity if it exists in the file system.
        If the entity's directory doesn't exist then throw an error.
        If the entity's metadata file does not exist then create a default.
        """
        newobj = cls(id)
        resource_dir = await newobj.get_dir()
        if not await storage.isdir(resource_dir):
            raise FileNotFoundError(f"Directory for {cls.__name__} with id '{id}' not found")
        json_file = await newobj._get_json_file()
        if not await storage.exists(json_file):
            async with await storage.open(json_file, "w", encoding="utf-8") as f:
                await f.write(json.dumps(newobj._default_json()))
        return newobj

    ###
    # INTERNAL METHODS
    # There are used by all subclasses to initialize, get and set JSON data
    ###

    async def _initialize(self):
        """
        Default function to initialize the file system and json object.
        To alter the default metadata update the _default_json method.
        """

        # Create directory for this resource
        dir = await self.get_dir()
        await storage.makedirs(dir, exist_ok=True)
        print(f"Created directory for {type(self).__name__} with id '{self.id}'")

        # Create a default json file. Throw an error if one already exists.
        json_file = await self._get_json_file()
        if await storage.exists(json_file):
            raise FileExistsError(f"{type(self).__name__} with id '{self.id}' already exists")
        async with await storage.open(json_file, "w", encoding="utf-8") as f:
            await f.write(json.dumps(self._default_json()))

    def _default_json(self):
        """Override in subclasses to support the initialize method."""
        return {"id": self.id}

    async def _get_json_file(self):
        """Get json file containing metadata for this resource."""
        return storage.join(await self.get_dir(), "index.json")

    async def get_json_data(self, uncached: bool = False, max_retries: int = 5):
        """
        Return the JSON data that is stored for this resource in the filesystem.
        If the file doesn't exist then return an empty dict.

        Args:
            uncached: If True, use an uncached filesystem to avoid Etag caching issues
            max_retries: Maximum number of retries for Etag errors (default: 5)
        """
        import asyncio

        json_file = await self._get_json_file()

        # Try opening this file location and parsing the json inside
        # On any error return an empty dict
        for attempt in range(max_retries):
            try:
                async with await storage.open(json_file, "r", encoding="utf-8") as f:
                    content = await f.read()
                    # Clean the content - remove trailing whitespace and extra characters
                    content = content.strip()
                    # Remove any trailing % characters (common in some shell outputs)
                    content = content.rstrip("%")
                    content = content.strip()
                    return json.loads(content)
            except FileNotFoundError:
                # File doesn't exist, return empty dict
                return {}
            except json.JSONDecodeError:
                # Invalid JSON, return empty dict
                return {}
            except Exception as e:
                # Check if this is the Etag mismatch error
                error_str = str(e)
                has_errno_16 = (
                    (hasattr(e, "errno") and e.errno == 16) or "Errno 16" in error_str or "[Errno 16]" in error_str
                )
                is_etag_error = "Etag" in error_str and "no longer exists" in error_str and has_errno_16

                if is_etag_error:
                    if attempt < max_retries - 1:
                        # Wait a short time before retrying (exponential backoff)
                        await asyncio.sleep(0.5 * (2**attempt))
                        continue
                    else:
                        # Last attempt failed, return empty dict
                        return {}
                else:
                    # Different exception, return empty dict
                    return {}

    async def _set_json_data(self, json_data):
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
        json_file = await self._get_json_file()
        async with await storage.open(json_file, "w", encoding="utf-8") as f:
            await f.write(json.dumps(json_data, ensure_ascii=False))

    async def _get_json_data_field(self, key, default=""):
        """Gets the value of a single top-level field in a JSON object"""
        json_data = await self.get_json_data(uncached=True)
        return json_data.get(key, default)

    async def _update_json_data_field(self, key: str, value):
        """Sets the value of a single top-level field in a JSON object"""
        json_data = await self.get_json_data(uncached=True)
        json_data[key] = value
        await self._set_json_data(json_data)

    async def delete(self):
        """
        Delete this resource by deleting the containing directory.
        TODO: We should change to soft delete
        """
        resource_dir = await self.get_dir()
        if await storage.exists(resource_dir):
            await storage.rm_tree(resource_dir)
