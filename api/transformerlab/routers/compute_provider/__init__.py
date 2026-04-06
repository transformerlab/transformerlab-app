# Re-export router so `from transformerlab.routers import compute_provider`
# still works in api.py without any changes.
from transformerlab.routers.compute_provider.compute_provider import router  # noqa: F401
