from transformerlab_cli.commands.job_monitor.JobMonitorApp import JobMonitorApp


def run_monitor() -> None:
    app = JobMonitorApp()
    app.run()


if __name__ == "__main__":
    run_monitor()
