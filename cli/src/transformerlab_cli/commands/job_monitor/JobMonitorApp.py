from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, ListView, LoadingIndicator, ListItem, Label
from textual.containers import Horizontal, Vertical, Container
from textual import work
from textual.theme import Theme

from transformerlab_cli.util.config import get_current_experiment

from transformerlab_cli.commands.job_monitor.JobDetails import JobDetails
from transformerlab_cli.commands.job_monitor.ExperimentSelectModal import ExperimentSelectModal
from transformerlab_cli.commands.job_monitor.TaskAddModal import TaskAddModal
from transformerlab_cli.commands.job_monitor.TaskListModal import TaskListModal

from transformerlab_cli.commands.job_monitor.util import fetch_jobs


class JobListItem(ListItem):
    def __init__(self, job: dict) -> None:
        super().__init__(classes="job-list-item")
        self.job = job

    def compose(self) -> ComposeResult:
        job_data = self.job.get("job_data", {})
        task_name = job_data.get("task_name", "Unknown")
        status = self.job.get("status", "N/A")

        # THEME: Use $secondary (Pink) for the ID/Header to match CLI 'header'
        yield Label(f"[bold $secondary]{task_name} [{self.job.get('id', '?')}][/]")

        # THEME: Use Textual variables ($success, $error) which we mapped above
        if status == "COMPLETED":
            status_color = "$success"
        elif status == "FAILED":
            status_color = "$error"
        else:
            status_color = "$warning"

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
        ("a", "add_task", "Add Task"),
        ("l", "list_tasks", "List Tasks"),
    ]

    def compose(self) -> ComposeResult:
        yield Header(icon="")
        with Horizontal(id="main-container"):
            # Left panel
            with Vertical(id="left-panel", classes="column"):
                yield LoadingIndicator(id="loading")
                joblistcontainer = Container(id="job-list-container")
                joblistcontainer.border_title = "Jobs"
                with joblistcontainer:
                    yield ListView(id="job-list")

            # Right panel
            yield JobDetails()
        yield Footer()

    def on_mount(self) -> None:
        # 2. Register and Apply the Theme
        self.theme = "tokyo-night"

        self.update_current_experiment()
        self.load_jobs()

    def action_set_experiment(self) -> None:
        self.push_screen(ExperimentSelectModal())

    def action_add_task(self) -> None:
        self.push_screen(TaskAddModal())

    def action_list_tasks(self) -> None:
        self.push_screen(TaskListModal())

    def action_refresh(self) -> None:
        """Refresh the job list."""
        self.load_jobs()

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
        try:
            job_list = self.query_one("#job-list", ListView)
            job_list.display = False
        except Exception:
            pass

    def populate_jobs(self, jobs: list[dict]) -> None:
        loading = self.query_one("#loading", LoadingIndicator)
        loading.display = False

        try:
            job_list = self.query_one("#job-list", ListView)
            job_list.display = True
            job_list.clear()

            for job in jobs:
                job_list.append(JobListItem(job))
        except Exception:
            # Handle case where widget might be unmounted during refresh
            pass

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if isinstance(event.item, JobListItem):
            details = self.query_one(JobDetails)
            details.set_job(event.item.job)
