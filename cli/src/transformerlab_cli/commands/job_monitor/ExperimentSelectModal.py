from textual.app import ComposeResult
from textual.widgets import (
    Static,
    Label,
    LoadingIndicator,
    Select,
)
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual import on, work
from transformerlab_cli.util import api
from transformerlab_cli.util.config import get_current_experiment, set_config


class ExperimentSelectModal(ModalScreen):
    """
    A modal that dynamically mounts the Select widget only when data is ready.
    This prevents rendering glitches where the value is set but not shown.
    """

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
    Select {
        width: 100%;
        height: auto;
        min-height: 3;
    }
    Select > SelectCurrent {
        width: 1fr;
        height: auto;
        min-height: 1;
        padding: 0 1;
    }
    Select > SelectCurrent > Static {
        width: 1fr;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self) -> None:
        super().__init__()
        self.current_experiment = "alpha"

    def compose(self) -> ComposeResult:
        with Vertical(id="experiment-modal"):
            yield Label("[b]Choose an experiment[/b]")

            with Vertical(id="dialog-body"):
                yield LoadingIndicator(id="experiment-loader")  # No `visible` argument
                yield Select(
                    id="experiment-select",
                    options=[("alpha", "alpha"), ("beta", "beta")],  # Placeholder options
                )
            yield Static("", id="experiment-feedback")

    def on_mount(self) -> None:
        self.fetch_experiments()
        self.current_experiment = get_current_experiment()

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

        options = [(str(exp.get("id")), exp.get("name")) for exp in data]
        self.app.call_from_thread(self._update_experiments, options)

    def _update_experiments(self, options: list[tuple[str, str]]) -> None:
        """Update the UI with fetched experiments (must be called from main thread)."""
        loader = self.query_one("#experiment-loader", LoadingIndicator)
        loader.display = False

        feedback = self.query_one("#experiment-feedback", Static)
        if not options:
            feedback.update("[yellow]No experiments found.[/yellow]")
            return

        select = self.query_one("#experiment-select", Select)
        with select.prevent(Select.Changed):
            select.set_options(options)
            select.value = self.current_experiment
            select.expanded = True

    @on(Select.Changed, "#experiment-select")
    def select_changed(self, event: Select.Changed) -> None:
        print(event)
        print("Experiment selected:", event.value)

        if event.value != Select.BLANK:
            set_config("current_experiment", event.value)
            self.app.on_experiment_changed()
        self.dismiss()
