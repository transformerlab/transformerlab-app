from __future__ import annotations

import time
from typing import Optional

from textual import work
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, Label, RichLog

from transformerlab_cli.util import api
from transformerlab_cli.util.config import get_current_experiment


class JobLogs(Vertical):
    """Log viewer panel for a selected job."""

    def __init__(self) -> None:
        super().__init__()
        self.current_job_id: Optional[str] = None
        self._polling: bool = False

    def compose(self) -> ComposeResult:
        yield Label("[bold]Logs[/bold]", id="logs-title")
        yield RichLog(id="job-log-view", highlight=True, markup=False, wrap=True)
        with Horizontal(id="log-buttons"):
            yield Button("Clear", id="btn-clear-logs", variant="default")

    def set_job(self, job: dict) -> None:
        """Called when a new job is selected in the job list."""
        self.current_job_id = str(job.get("id", ""))
        log_view = self.query_one("#job-log-view", RichLog)
        log_view.clear()
        title = self.query_one("#logs-title", Label)
        title.update(f"[bold]Logs — Job {self.current_job_id}[/bold]")
        self._polling = True
        self._poll_logs()

    def on_unmount(self) -> None:
        self._polling = False

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-clear-logs":
            self.query_one("#job-log-view", RichLog).clear()

    @work(thread=True)
    def _poll_logs(self) -> None:
        seen_lines = 0
        experiment_id = get_current_experiment() or "alpha"

        while self._polling and self.current_job_id:
            try:
                response = api.get(
                    f"/experiment/{experiment_id}/jobs/{self.current_job_id}/provider_logs",
                    timeout=10.0,
                )
                if response.status_code == 200:
                    data = response.json()
                    logs_text = data.get("logs", "") if isinstance(data, dict) else ""
                    lines = logs_text.splitlines() if logs_text else []

                    if len(lines) < seen_lines:
                        seen_lines = 0

                    new_lines = lines[seen_lines:]
                    if new_lines:
                        log_view = self.query_one("#job-log-view", RichLog)
                        for line in new_lines:
                            self.app.call_from_thread(log_view.write, line)
                        seen_lines = len(lines)
            except Exception:
                pass

            time.sleep(3)
