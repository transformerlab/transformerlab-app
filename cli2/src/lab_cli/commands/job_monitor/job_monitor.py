import json

from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, ListView, ListItem, Static, Label, LoadingIndicator, ProgressBar
from textual.containers import Horizontal
from textual import work

from lab_cli.util import api


def fetch_jobs() -> list[dict]:
    """Fetch all jobs from the API."""
    response = api.get("/experiment/alpha/jobs/list?type=REMOTE")
    if response.status_code == 200:
        return response.json()
    return []


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
    def compose(self) -> ComposeResult:
        yield ProgressBar(total=100, show_eta=False, id="job-progress")
        yield Static("Select a job to view details", id="job-json")

    def set_job(self, job: dict) -> None:
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

        details_view = self.query_one("#job-json", Static)
        details_view.update(details)


class JobMonitorApp(App):
    TITLE = "Transformer Lab"
    SUB_TITLE = "Job Monitor"
    ENABLE_COMMAND_PALETTE = False
    CSS = """
    Horizontal {
        height: 100%;
    }
    ListView {
        width: 40%;
        border: solid green;
    }
    JobDetails {
        width: 60%;
        border: solid blue;
        padding: 0 2;
        height: 100%;
    }
    #loading {
        width: 40%;
        height: 100%;
        content-align: center middle;
    }
    ListView {
        display: none;
    }
    ListView.loaded {
        display: block;
    }
    """

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
