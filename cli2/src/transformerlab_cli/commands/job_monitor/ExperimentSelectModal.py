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
from textual import on, work
from textual.reactive import reactive

from transformerlab_cli.util import api
from transformerlab_cli.util.config import get_current_experiment, set_config


class ExperimentSelectModal(ModalScreen):
    """
    A modal that dynamically mounts the Select widget only when data is ready.
    This prevents rendering glitches where the value is set but not shown.
    """

    experiment_options: reactive[list[tuple[str, str]] | None] = reactive(None)
    is_loading: reactive[bool] = reactive(True)  # Add a reactive property for loading state
    selected_value: reactive[str | None] = reactive(None)

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

        # format the data which looks like [{"name":"alpha","id":"alpha","config":{}},{"name":"beta","id":"beta","config":{}}]
        # to a tuple list which looks like [("alpha","alpha"),("beta","beta")]
        options = [(str(exp.get("id")), exp.get("name")) for exp in data]
        self.experiment_options = options
        self.is_loading = False

    def watch_is_loading(self, is_loading: bool) -> None:
        """Show or hide the loading indicator based on the loading state."""
        loader = self.query_one("#experiment-loader", LoadingIndicator)
        loader.display = is_loading  # Control visibility using the `display` property

    def watch_experiment_options(self, experiments: list[tuple[str, str]] | None) -> None:
        """
        Replaces the LoadingIndicator with a configured Select widget.
        """
        feedback = self.query_one("#experiment-feedback", Static)

        if experiments is None:
            return

        if not experiments:
            feedback.update("[yellow]No experiments found.[/yellow]")
            return

        select = self.query_one("#experiment-select", Select)
        with select.prevent(Select.Changed):
            select.options = experiments
            select.value = self.current_experiment
            select.expanded = True
        print("Experiments loaded:", experiments)

    @on(Select.Changed, "#experiment-select")
    def select_changed(self, event: Select.Changed) -> None:
        print(event)
        print("Experiment selected:", event.value)

        if event.value != Select.BLANK:
            set_config("current_experiment", event.value)
            self.app.on_experiment_changed()
        self.dismiss()
