from werkzeug.utils import secure_filename
from typing import Optional

from .dirs import get_datasets_dir, get_experiments_dir, get_job_datasets_dir
from .labresource import BaseLabResource
from . import storage


class Dataset(BaseLabResource):
    def __init__(self, id: str, job_id: Optional[str] = None):
        """
        Initialize a Dataset resource.

        Args:
            id: The dataset identifier
            job_id: Optional job ID. If provided, the dataset is scoped to the job's directory
        """
        super().__init__(id)
        self.job_id = job_id

    @classmethod
    async def create(cls, id: str, job_id: Optional[str] = None):
        """Create a new dataset, optionally scoped to a job."""
        newobj = cls(id, job_id=job_id)
        await newobj._initialize()
        return newobj

    @classmethod
    async def get(cls, id: str, job_id: Optional[str] = None):
        """Get an existing dataset, optionally scoped to a job."""
        newobj = cls(id, job_id=job_id)
        resource_dir = await newobj.get_dir()
        if not await storage.isdir(resource_dir):
            raise FileNotFoundError(f"Directory for {cls.__name__} with id '{id}' not found")
        json_file = await newobj._get_json_file()
        if not await storage.exists(json_file):
            import json

            async with await storage.open(json_file, "w", encoding="utf-8") as f:
                await f.write(json.dumps(newobj._default_json()))
        return newobj

    async def get_dir(self):
        """Abstract method on BaseLabResource"""
        dataset_id_safe = secure_filename(str(self.id))
        if self.job_id:
            # Jobs are now stored under experiments/{exp_id}/jobs/{job_id}/.
            # Since callers provide only job_id, infer exp_id by scanning experiments.
            exp_id = await self._find_job_experiment_id()
            if not exp_id:
                raise FileNotFoundError(f"Job with id '{self.job_id}' not found")
            return await get_job_datasets_dir(self.job_id, exp_id)
        else:
            # Use global datasets directory
            datasets_dir = await get_datasets_dir()
            return storage.join(datasets_dir, dataset_id_safe)

    async def _find_job_experiment_id(self) -> Optional[str]:
        job_id_safe = secure_filename(str(self.job_id))
        experiments_dir = await get_experiments_dir()

        try:
            exp_entries = await storage.ls(experiments_dir, detail=False)
        except Exception:
            return None

        for exp_path in exp_entries:
            if not await storage.isdir(exp_path):
                continue

            exp_id = exp_path.rstrip("/").split("/")[-1]
            job_dir = storage.join(exp_path, "jobs", job_id_safe)
            if await storage.isdir(job_dir):
                return exp_id

        return None

    def _default_json(self):
        # Default metadata modeled after API dataset table fields
        return {
            "dataset_id": self.id,
            "location": "local",
            "description": "",
            "size": -1,
            "json_data": {},
        }

    async def set_metadata(
        self,
        *,
        location: str | None = None,
        description: str | None = None,
        size: int | None = None,
        json_data: dict | None = None,
    ):
        data = await self.get_json_data()
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
        await self._set_json_data(data)

    async def get_metadata(self):
        return await self.get_json_data()

    @staticmethod
    async def list_all():
        results = []
        datasets_dir = await get_datasets_dir()
        if not await storage.isdir(datasets_dir):
            return results
        try:
            entries = await storage.ls(datasets_dir, detail=False)
        except Exception:
            entries = []
        for full in entries:
            if not await storage.isdir(full):
                continue
            # Attempt to read index.json (or latest snapshot)
            try:
                entry = full.rstrip("/").split("/")[-1]
                ds = Dataset(entry)
                results.append(await ds.get_metadata())
            except Exception:
                continue
        return results
