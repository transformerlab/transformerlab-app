import json

from textual.app import App, ComposeResult

from textual.widgets import (
    Header,
    Footer,
    ListView,
    ListItem,
    Static,
    Label,
    LoadingIndicator,
    ProgressBar,
    Button,
    TextArea,
)
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual import work

from lab_cli.util import api


def fetch_jobs() -> list[dict]:
    """Fetch all jobs from the API."""
    response = api.get("/experiment/alpha/jobs/list?type=REMOTE")
    if response.status_code == 200:
        return response.json()
    return []


class JobJsonModal(ModalScreen):
    """
    A modal that displays the Job JSON in a selectable TextArea.
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self, job: dict) -> None:
        super().__init__()
        self.job = job

    def compose(self) -> ComposeResult:
        json_str = json.dumps(self.job, indent=2, default=str)

        with Vertical(id="json-modal-container"):
            yield TextArea(json_str, language="json", theme="dracula", read_only=True)
            yield Button("Close", id="btn-close-modal")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-close-modal":
            self.dismiss()


# ---------------------


class JobListItem(ListItem):
    def __init__(self, job: dict) -> None:
        super().__init__()
        self.job = job

    def compose(self) -> ComposeResult:
        job_data = self.job.get("job_data", {})
        task_name = job_data.get("task_name", "Unknown")
        status = self.job.get("status", "N/A")
        yield Label(f"[{self.job.get('id', '?')}] {task_name} ({status})")


class JobDetails(Static):
    def __init__(self) -> None:
        super().__init__()
        self.current_job = None

    def compose(self) -> ComposeResult:
        yield ProgressBar(total=100, show_eta=False, id="job-progress")
        yield Static("Select a job to view details", id="job-info")
        with Vertical(id="job-buttons"):
            yield Button("View Task Details", id="btn-view-json")
            yield Button("Download All Artifacts", id="btn-download")

    def set_job(self, job: dict) -> None:
        self.current_job = job

        progress_bar = self.query_one("#job-progress", ProgressBar)
        progress_bar.update(progress=job.get("progress", 0))

        job_data = job.get("job_data", {})
        details = (
            f"[bold]{job_data.get('task_name', 'N/A')}[/bold]\n\n"
            f"[cyan]ID:[/cyan] {job.get('id', 'N/A')}\n"
            f"[cyan]Task Name:[/cyan] {job_data.get('task_name', 'N/A')}\n"
            f"[cyan]Status:[/cyan] {job.get('status', 'N/A')}\n"
            f"[cyan]Progress:[/cyan] {job.get('progress', 0)}%\n"
            f"[cyan]Experiment:[/cyan] {job.get('experiment_id', 'N/A')}\n"
            f"[cyan]Model:[/cyan] {job_data.get('model_name', 'N/A')}\n"
            f"[cyan]Cluster:[/cyan] {job_data.get('cluster_name', 'N/A')}\n"
            f"[cyan]Completion:[/cyan] {job_data.get('completion_status', 'N/A')}"
        )

        details_view = self.query_one("#job-info", Static)
        details_view.update(details)

        buttons = self.query_one("#job-buttons")
        buttons.add_class("visible")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-view-json":
            if self.current_job:
                self.app.push_screen(JobJsonModal(self.current_job))
        elif event.button.id == "btn-download":
            self.notify("Download artifacts not implemented yet", severity="warning")


class JobMonitorApp(App):
    TITLE = "Transformer Lab"
    SUB_TITLE = "Job Monitor"
    ENABLE_COMMAND_PALETTE = False
    CSS_PATH = "./styles.tcss"

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("r", "refresh", "Refresh"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal():
            yield LoadingIndicator(id="loading")
            yield ListView(id="job-list")
            yield JobDetails()
        yield Footer()

    def on_mount(self) -> None:
        self.theme = "nord"
        self.load_jobs()

    def action_refresh(self) -> None:
        self.load_jobs()

    @work(thread=True)
    def load_jobs(self) -> None:
        self.call_from_thread(self.show_loading)
        jobs = fetch_jobs()
        self.call_from_thread(self.populate_jobs, jobs)

    def show_loading(self) -> None:
        loading = self.query_one("#loading", LoadingIndicator)
        loading.display = True
        job_list = self.query_one("#job-list", ListView)
        job_list.remove_class("loaded")

    def populate_jobs(self, jobs: list[dict]) -> None:
        loading = self.query_one("#loading", LoadingIndicator)
        loading.display = False

        job_list = self.query_one("#job-list", ListView)
        job_list.clear()
        for job in jobs:
            job_list.append(JobListItem(job))
        job_list.add_class("loaded")

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if isinstance(event.item, JobListItem):
            details = self.query_one(JobDetails)
            details.set_job(event.item.job)


def run_monitor() -> None:
    app = JobMonitorApp()
    app.run()
