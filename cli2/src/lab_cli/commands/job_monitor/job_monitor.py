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


class ExperimentSelectModal(ModalScreen):
    """
    A modal that dynamically mounts the Select widget only when data is ready.
    This prevents rendering glitches where the value is set but not shown.
    """

    raw_experiments: reactive[list[dict] | None] = reactive(None)
    is_loading: reactive[bool] = reactive(True)  # Add a reactive property for loading state

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
                yield LoadingIndicator(id="experiment-loader")  # No `visible` argument

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
            else:
                data = []
        except Exception:
            data = []

        self.raw_experiments = data

    def update_experiments(self, experiments: list[dict]) -> None:
        """Update the experiments and hide the loader."""
        self.raw_experiments = experiments
        self.is_loading = False  # Update the loading state

    def watch_is_loading(self, is_loading: bool) -> None:
        """Show or hide the loading indicator based on the loading state."""
        loader = self.query_one("#experiment-loader", LoadingIndicator)
        loader.display = is_loading  # Control visibility using the `display` property

    def watch_raw_experiments(self, experiments: list[dict] | None) -> None:
        """
        Replaces the LoadingIndicator with a configured Select widget.
        """
        container = self.query_one("#dialog-body")
        feedback = self.query_one("#experiment-feedback", Static)

        if experiments is None:
            return

        container.remove_children()

        if not experiments:
            feedback.update("[yellow]No experiments found.[/yellow]")
            return

        # 3. Build Options
        options = []
        for exp in experiments:
            e_id = str(exp.get("id") or exp.get("name"))
            name = str(exp.get("name") or e_id)
            options.append((name, e_id))

        print(options)
        print(self.current_exp_config)

        select_widget = Select(
            options,
            value=None,
            id="experiment-select",
            prompt="Select an experiment",
        )

        container.mount(select_widget)

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


def run_monitor() -> None:
    app = JobMonitorApp()
    app.run()


if __name__ == "__main__":
    run_monitor()
