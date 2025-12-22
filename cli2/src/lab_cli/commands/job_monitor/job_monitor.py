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
    Select,
)
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual import work
from textual.reactive import reactive

from lab_cli.util import api
from lab_cli.util.config import get_current_experiment, set_config


def fetch_jobs() -> list[dict]:
    """Fetch all jobs from the API."""
    exp = get_current_experiment()
    try:
        response = api.get(f"/experiment/{exp}/jobs/list?type=REMOTE")
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
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


class ExperimentSelectModal(ModalScreen):
    """
    A modal that dynamically mounts the Select widget only when data is ready.
    This prevents rendering glitches where the value is set but not shown.
    """

    raw_experiments: reactive[list[dict] | None] = reactive(None)

    DEFAULT_CSS = """
    ExperimentSelectModal {
        align: center middle;
    }
    #experiment-modal {
        width: 40%;
        min-width: 40;
        height: auto;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    #dialog-body {
        height: auto;
        min-height: 3;
        align: center middle;
        margin-bottom: 1;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self) -> None:
        super().__init__()
        raw_current = get_current_experiment()
        self.current_exp_config = str(raw_current) if raw_current is not None else None
        self.selected_value: str | None = None

    def compose(self) -> ComposeResult:
        with Vertical(id="experiment-modal"):
            yield Label("[b]Choose an experiment[/b]")

            # 1. A dedicated container for the dynamic content (Loader OR Select)
            with Vertical(id="dialog-body"):
                yield LoadingIndicator()

            yield Button("Set Experiment", id="btn-apply-experiment", variant="primary", disabled=True)
            yield Static("", id="experiment-feedback")

    def on_mount(self) -> None:
        self.fetch_experiments()

    @work(thread=True)
    def fetch_experiments(self) -> None:
        try:
            response = api.get("/experiment/")
            if response.status_code == 200:
                data = response.json()
                # SAFE: Update reactive variable on the main thread
                self.app.call_from_thread(setattr, self, "raw_experiments", data)
            else:
                self.app.call_from_thread(self.notify, f"Error: {response.status_code}", severity="error")
                self.app.call_from_thread(setattr, self, "raw_experiments", [])
        except Exception:
            self.app.call_from_thread(self.notify, "Failed to connect to API", severity="error")
            self.app.call_from_thread(setattr, self, "raw_experiments", [])

    def watch_raw_experiments(self, experiments: list[dict] | None) -> None:
        """
        Replaces the LoadingIndicator with a configured Select widget.
        """
        container = self.query_one("#dialog-body")
        feedback = self.query_one("#experiment-feedback", Static)

        # Do nothing if we are still in initial None state
        if experiments is None:
            return

        # 1. Clear the Loading Indicator
        container.remove_children()

        # 2. Handle Empty Data
        if not experiments:
            feedback.update("[yellow]No experiments found.[/yellow]")
            return

        # 3. Build Options
        options = []
        for exp in experiments:
            e_id = str(exp.get("id") or exp.get("name"))
            name = str(exp.get("name") or e_id)
            options.append((name, e_id))

        # 4. Find the Match (The "Smart Match" logic)
        target = self.current_exp_config
        matched_value = None

        if target:
            # Try matching ID first
            matched_value = next((val for _, val in options if val == target), None)
            # Try matching Label second
            if not matched_value:
                matched_value = next((val for lbl, val in options if lbl == target), None)

        # Fallback to first option if no match and no previous selection
        if not matched_value and options:
            matched_value = options[0][1]

        # 5. Create and Mount the NEW Select Widget
        # Passing `value` to __init__ guarantees it renders correctly.
        select_widget = Select(
            options,
            value=matched_value,  # <--- Crucial: Set value at birth
            id="experiment-select",
            prompt="Select an experiment",
        )

        container.mount(select_widget)

        # 6. Update Button State
        if matched_value:
            self.selected_value = matched_value
            self.query_one("#btn-apply-experiment", Button).disabled = False

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.value != Select.BLANK:
            self.selected_value = str(event.value)
            self.query_one("#btn-apply-experiment", Button).disabled = False
        else:
            self.query_one("#btn-apply-experiment", Button).disabled = True

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-apply-experiment" and self.selected_value:
            set_config("current_experiment", self.selected_value)
            self.app.on_experiment_changed()  # Notify the app of the change
            self.dismiss()


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


class JobDetails(Vertical):
    def __init__(self) -> None:
        super().__init__()
        self.current_job = None

    def compose(self) -> ComposeResult:
        # 1. Progress Bar at top
        yield ProgressBar(total=100, show_eta=False, id="job-progress")

        # 2. Info Scroll Container (Top half)
        with VerticalScroll(id="job-info-container"):
            yield Static("", id="job-info")

        # 3. Artifacts Scroll Container (Middle)
        with VerticalScroll(id="job-artifacts-container"):
            yield Static("[bold]Artifacts:[/bold]\nNo artifacts available.", id="job-artifacts")

        # 4. Buttons (Bottom)
        with Horizontal(id="job-buttons"):
            yield Button("View Job Details", id="btn-view-json", variant="primary")
            yield Button("Download All Artifacts", id="btn-download", variant="primary")

    def set_job(self, job: dict) -> None:
        self.current_job = job

        progress_bar = self.query_one("#job-progress", ProgressBar)
        progress_bar.update(progress=job.get("progress", 0))
        progress_bar.add_class("visible")

        job_data = job.get("job_data", {})
        details = (
            f"[bold]{job_data.get('task_name', 'N/A')}[/bold]\n\n"
            f"[$primary]ID:[/$primary] {job.get('id', 'N/A')}\n"
            f"[$primary]Task Name:[/$primary] {job_data.get('task_name', 'N/A')}\n"
            f"[$primary]Status:[/$primary] {job.get('status', 'N/A')}\n"
            f"[$primary]Progress:[/$primary] {job.get('progress', 0)}%\n"
            f"[$primary]Experiment:[/$primary] {job.get('experiment_id', 'N/A')}\n"
            f"[$primary]Model:[/$primary] {job_data.get('model_name', 'N/A')}\n"
            f"[$primary]Cluster:[/$primary] {job_data.get('cluster_name', 'N/A')}\n"
            f"[$primary]Completion:[/$primary] {job_data.get('completion_status', 'N/A')}"
        )

        details_view = self.query_one("#job-info", Static)
        details_view.update(details)

        # Make buttons visible
        buttons = self.query_one("#job-buttons")
        buttons.add_class("visible")

        # Update artifacts panel
        artifacts = job.get("job_data", {}).get("artifacts", [])
        if artifacts:
            artifacts_text = "\n".join([f"- {art}" for art in artifacts])
        else:
            artifacts_text = "[italic]No artifacts available[/italic]"

        artifacts_view = self.query_one("#job-artifacts", Static)
        artifacts_view.update(f"[bold]Artifacts:[/bold]\n{artifacts_text}")

        # Make artifacts container visible
        artifacts_container = self.query_one("#job-artifacts-container", VerticalScroll)
        artifacts_container.add_class("visible")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-view-json":
            if self.current_job:
                self.app.push_screen(JobJsonModal(self.current_job))
        elif event.button.id == "btn-download":
            self.notify("Download artifacts not implemented yet", severity="warning")


class JobMonitorApp(App):
    TITLE = "Transformer Lab "
    SUB_TITLE = "Job Monitor"
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
        self.sub_title = f"Job Monitor - Experiment {experiment_name}"

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


def run_monitor() -> None:
    app = JobMonitorApp()
    app.run()


if __name__ == "__main__":
    run_monitor()
