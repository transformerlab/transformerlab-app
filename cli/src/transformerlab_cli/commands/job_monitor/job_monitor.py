from transformerlab_cli.commands.job_monitor.JobMonitorApp import JobMonitorApp
from transformerlab_cli.util.config import load_config
from transformerlab_cli.util.shared import set_base_url


def run_monitor() -> None:
    config = load_config()
    set_base_url(config.get("server"))
    app = JobMonitorApp()
    app.run()


if __name__ == "__main__":
    run_monitor()
