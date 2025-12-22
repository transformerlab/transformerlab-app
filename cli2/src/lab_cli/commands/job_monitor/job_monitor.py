from textual.app import ComposeResult
from textual.widgets import (
    Static,
    Label,
    LoadingIndicator,
    Button,
    Select,
)
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual import work
from textual.reactive import reactive

from lab_cli.util import api
from lab_cli.util.config import get_current_experiment, set_config

from lab_cli.commands.job_monitor.JobMonitorApp import JobMonitorApp


def run_monitor() -> None:
    app = JobMonitorApp()
    app.run()


if __name__ == "__main__":
    run_monitor()
