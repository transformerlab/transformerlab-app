from textual import work
from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Footer, Header, Label, ListItem, ListView, LoadingIndicator

from transformerlab_cli.commands.job_monitor.ExperimentSelectModal import ExperimentSelectModal
from transformerlab_cli.commands.job_monitor.InteractiveTaskModal import InteractiveTaskModal
from transformerlab_cli.commands.job_monitor.JobDetails import JobDetails
from transformerlab_cli.commands.job_monitor.TaskAddModal import TaskAddModal
from transformerlab_cli.commands.job_monitor.TaskListModal import TaskListModal
from transformerlab_cli.commands.job_monitor.util import fetch_jobs
from transformerlab_cli.util.config import get_current_experiment


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
        ("t", "list_tasks", "Tasks"),
        ("i", "interactive_task", "Interactive Task"),
        ("L", "toggle_logs", "Logs"),
        ("g", "gallery", "Gallery"),
        ("p", "toggle_refresh", "Pause/Resume"),
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
            from transformerlab_cli.commands.job_monitor.JobLogs import JobLogs

            with Vertical(id="right-panel"):
                yield JobDetails()
                yield JobLogs()
        yield Footer()

    def on_mount(self) -> None:
        self.theme = "tokyo-night"

        self._refresh_paused: bool = False
        self.update_current_experiment()
        self.load_jobs()
        self._refresh_timer = self.set_interval(10, self._auto_refresh)

    def _auto_refresh(self) -> None:
        """Auto-refresh job list if not paused."""
        if not self._refresh_paused:
            self.load_jobs()

    def action_set_experiment(self) -> None:
        self.push_screen(ExperimentSelectModal())

    def action_add_task(self) -> None:
        self.push_screen(TaskAddModal())

    def action_list_tasks(self) -> None:
        current_experiment = get_current_experiment() or "alpha"
        self.push_screen(TaskListModal(experiment_id=current_experiment))

    def action_interactive_task(self) -> None:
        self.push_screen(InteractiveTaskModal())

    def action_refresh(self) -> None:
        """Refresh the job list."""
        self.load_jobs()

    def action_toggle_refresh(self) -> None:
        """Toggle auto-refresh on/off."""
        self._refresh_paused = not self._refresh_paused
        state = "PAUSED" if self._refresh_paused else "ON"
        self.notify(f"Auto-refresh: {state}")

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
            from transformerlab_cli.commands.job_monitor.JobLogs import JobLogs

            details = self.query_one(JobDetails)
            details.set_job(event.item.job)
            try:
                logs_panel = self.query_one(JobLogs)
                logs_panel._polling = False  # type: ignore[attr-defined]
                logs_panel.set_job(event.item.job)  # type: ignore[attr-defined]
            except Exception:
                pass

    def action_toggle_logs(self) -> None:
        """Toggle between job details view and log view."""
        from transformerlab_cli.commands.job_monitor.JobLogs import JobLogs

        details = self.query_one(JobDetails)
        logs_panel = self.query_one(JobLogs)
        if details.display:
            details.display = False
            logs_panel.display = True
        else:
            details.display = True
            logs_panel.display = False

    def action_gallery(self) -> None:
        """Open the gallery modal."""
        from transformerlab_cli.commands.job_monitor.GalleryModal import GalleryModal

        def on_gallery_dismissed(task_id: str | None) -> None:
            if task_id:
                self.notify(f"Task imported: ID {task_id}")

        self.push_screen(GalleryModal(), on_gallery_dismissed)
