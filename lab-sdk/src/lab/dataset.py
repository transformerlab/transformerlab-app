from werkzeug.utils import secure_filename

from .dirs import get_datasets_dir
from .labresource import BaseLabResource
from . import storage


class Dataset(BaseLabResource):
    def get_dir(self):
        """Abstract method on BaseLabResource"""
        dataset_id_safe = secure_filename(str(self.id))
        return storage.join(get_datasets_dir(), dataset_id_safe)

    def _default_json(self):
        # Default metadata modeled after API dataset table fields
        return {
            "dataset_id": self.id,
            "location": "local",
            "description": "",
            "size": -1,
            "json_data": {},
        }

    def set_metadata(self, *, location: str | None = None, description: str | None = None, size: int | None = None, json_data: dict | None = None):
        data = self.get_json_data()
        if location is not None:
            data["location"] = location
        if description is not None:
            data["description"] = description
        if size is not None:
            data["size"] = size
        if json_data is not None:
            # merge (shallow) to maintain parity and avoid dropping keys
            current = data.get("json_data", {})
            if not isinstance(current, dict):
                current = {}
            current.update(json_data)
            data["json_data"] = current
        self._set_json_data(data)

    def get_metadata(self):
        return self.get_json_data()

    @staticmethod
    def list_all():
        results = []
        datasets_dir = get_datasets_dir()
        if not storage.isdir(datasets_dir):
            return results
        try:
            entries = storage.ls(datasets_dir, detail=False)
        except Exception:
            entries = []
        for full in entries:
            if not storage.isdir(full):
                continue
            # Attempt to read index.json (or latest snapshot)
            try:
                entry = full.rstrip("/").split("/")[-1]
                ds = Dataset(entry)
                results.append(ds.get_metadata())
            except Exception:
                continue
        return results


