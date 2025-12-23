from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, ListView, LoadingIndicator, ListItem, Label
from textual.containers import Horizontal, Vertical
from textual import work

from transformerlab_cli.util.config import get_current_experiment

from transformerlab_cli.commands.job_monitor.JobDetails import JobDetails
from transformerlab_cli.commands.job_monitor.ExperimentSelectModal import ExperimentSelectModal

from transformerlab_cli.commands.job_monitor.util import fetch_jobs


class JobListItem(ListItem):
    def __init__(self, job: dict) -> None:
        super().__init__()
        self.job = job

    def compose(self) -> ComposeResult:
        job_data = self.job.get("job_data", {})
        task_name = job_data.get("task_name", "Unknown")
        status = self.job.get("status", "N/A")

        # Simple styling for the list item
        yield Label(f"[bold][$text-primary][{self.job.get('id', '?')}] {task_name}[/$text-primary][/bold]")
        status_color = "$success" if status == "COMPLETED" else "$error" if status == "FAILED" else "$warning"
        yield Label(f"Status: [{status_color}]{status}[/{status_color}]")


class JobMonitorApp(App):
    TITLE = "Transformer Lab"
    SUB_TITLE = ""
    ENABLE_COMMAND_PALETTE = False
    CSS_PATH = "./styles.tcss"

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("r", "refresh", "Refresh"),
        ("e", "set_experiment", "Set Experiment"),
    ]

    def compose(self) -> ComposeResult:
        yield Header(icon="🔬")
        with Horizontal(id="main-container"):
            # Left panel
            with Vertical(id="job-list-container", classes="column"):
                yield LoadingIndicator(id="loading")
                yield ListView(id="job-list")

            # Right panel
            yield JobDetails()
        yield Footer()

    def on_mount(self) -> None:
        self.theme = "nord"
        self.update_current_experiment()
        self.load_jobs()

    def action_set_experiment(self) -> None:
        self.push_screen(ExperimentSelectModal())

    def update_current_experiment(self) -> None:
        """Update the title and subtitle with the current experiment."""
        current_experiment = get_current_experiment()
        experiment_name = current_experiment if current_experiment else "No Experiment"
        self.sub_title = f"Experiment {experiment_name}"

    def on_experiment_changed(self) -> None:
        """React to experiment changes and update the title and subtitle."""
        self.update_current_experiment()
        self.load_jobs()

    @work(thread=True)
    def load_jobs(self) -> None:
        # Simulate network delay or just run
        self.call_from_thread(self.show_loading)
        jobs = fetch_jobs()
        self.call_from_thread(self.populate_jobs, jobs)

    def show_loading(self) -> None:
        loading = self.query_one("#loading", LoadingIndicator)
        loading.display = True
        job_list = self.query_one("#job-list", ListView)
        job_list.display = False

    def populate_jobs(self, jobs: list[dict]) -> None:
        loading = self.query_one("#loading", LoadingIndicator)
        loading.display = False

        job_list = self.query_one("#job-list", ListView)
        job_list.display = True
        job_list.clear()

        for job in jobs:
            job_list.append(JobListItem(job))

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if isinstance(event.item, JobListItem):
            details = self.query_one(JobDetails)
            details.set_job(event.item.job)
