import os

from transformerlab_cli.commands.job_monitor.JobMonitorApp import JobMonitorApp
from transformerlab_cli.util import api as api_mod
from transformerlab_cli.util.config import load_config
from transformerlab_cli.util.shared import set_base_url


def run_monitor(experiment_id: str | None = None) -> None:
    config = load_config()
    set_base_url(config.get("server"))
    previous_override = os.environ.get("LAB_EXPERIMENT_OVERRIDE")
    if experiment_id is not None and str(experiment_id).strip():
        os.environ["LAB_EXPERIMENT_OVERRIDE"] = str(experiment_id).strip()
    api_mod.set_reraise_transport_errors(True)
    try:
        app = JobMonitorApp()
        app.run()
    finally:
        if experiment_id is not None and str(experiment_id).strip():
            if previous_override is None:
                os.environ.pop("LAB_EXPERIMENT_OVERRIDE", None)
            else:
                os.environ["LAB_EXPERIMENT_OVERRIDE"] = previous_override
        api_mod.set_reraise_transport_errors(False)


if __name__ == "__main__":
    run_monitor()
