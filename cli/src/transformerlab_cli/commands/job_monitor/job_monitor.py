from transformerlab_cli.commands.job_monitor.JobMonitorApp import JobMonitorApp
from transformerlab_cli.util import api as api_mod
from transformerlab_cli.util.config import load_config
from transformerlab_cli.util.shared import set_base_url


def run_monitor() -> None:
    config = load_config()
    set_base_url(config.get("server"))
    api_mod.set_reraise_transport_errors(True)
    try:
        app = JobMonitorApp()
        app.run()
    finally:
        api_mod.set_reraise_transport_errors(False)


if __name__ == "__main__":
    run_monitor()
