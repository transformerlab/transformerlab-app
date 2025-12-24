from textual.app import ComposeResult
from textual.widgets import (
    Static,
    Label,
    Input,
    Button,
)
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual import on
from transformerlab_cli.commands.task import add_task
import re


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

    @on(Button.Pressed, "#task-submit")
    def handle_submit(self, event: Button.Pressed) -> None:
        task_input = self.query_one("#task-input", Input)
        task_path = task_input.value.strip()

        if not task_path:
            self.app.console.print("[red]Error:[/red] Task path cannot be empty.")
            return

        response = None

        if re.match(r"https?://", task_path):
            response = add_task(task_yaml_path=None, from_url=task_path)
        else:
            response = add_task(task_yaml_path=task_path, from_url=None)

        if response and response.get("status_code") != 200:
            self.notify("Task submission failed!", severity="warning")
        else:
            self.notify("Task submission successful!", severity="info")

        self.dismiss()
