from textual.app import ComposeResult
from textual.widgets import (
    Static,
    Label,
    Input,
    Button,
)
from textual.containers import Vertical
from textual.screen import ModalScreen


class TaskAddModal(ModalScreen):
    """
    A modal for adding a new task by specifying the path to a task.json file.
    """

    DEFAULT_CSS = """
    TaskAddModal {
        align: center middle;
    }
    #task-modal {
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

    def compose(self) -> ComposeResult:
        with Vertical(id="task-modal"):
            yield Label("[b]Add a New Task[/b]")

            with Vertical(id="dialog-body"):
                yield Input(placeholder="full path to task.json", id="task-input")
                yield Static("The path can be local to the computer or a URL on the internet.", id="task-helper")
            yield Button("Submit", id="task-submit")
