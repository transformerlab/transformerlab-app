from textual.app import ComposeResult
from textual.widgets import (
    Static,
    Label,
    LoadingIndicator,
    Button,
    OptionList,
    Input,
)
from textual.widgets.option_list import Option
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual import work, on

from transformerlab_cli.util import api


class TaskQueueModal(ModalScreen):
    """A modal for configuring task queue options."""

    DEFAULT_CSS = """
    TaskQueueModal {
        align: center middle;
    }
    #queue-modal {
        width: 50%;
        min-width: 40;
        height: auto;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    .form-row {
        height: auto;
        margin-bottom: 1;
    }
    .form-label {
        width: 100%;
        height: auto;
    }
    .form-input {
        width: 100%;
    }
    #queue-submit-btn {
        margin-top: 1;
        width: 100%;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self, task_info: dict) -> None:
        super().__init__()
        self.task_info = task_info

    def compose(self) -> ComposeResult:
        task_name = self.task_info.get("name", "Unknown")
        with Vertical(id="queue-modal"):
            yield Label(f"[b]Queue Task: {task_name}[/b]")

            with Vertical(classes="form-row"):
                yield Label("CPU Resources:", classes="form-label")
                yield Input(placeholder="e.g. 2", id="cpu-input", classes="form-input")

            with Vertical(classes="form-row"):
                yield Label("Memory Resources:", classes="form-label")
                yield Input(placeholder="e.g. 4GB", id="memory-input", classes="form-input")

            yield Button("Queue", id="queue-submit-btn", variant="primary")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "queue-submit-btn":
            self.notify("Queue functionality not implemented yet.", severity="information")
            self.dismiss()


class TaskListModal(ModalScreen):
    """A modal for listing all available tasks."""

    DEFAULT_CSS = """
    TaskListModal {
        align: center middle;
    }
    #task-list-modal {
        width: 60%;
        min-width: 50;
        height: 80%;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    #task-list-body {
        height: 100%;
        margin-bottom: 1;
    }
    #task-option-list {
        height: 100%;
        min-height: 10;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self, experiment_id: str = "default") -> None:
        super().__init__()
        self.experiment_id = experiment_id
        self.tasks_data: list[dict] = []

    def compose(self) -> ComposeResult:
        with Vertical(id="task-list-modal"):
            yield Label("[b]Available Tasks[/b]")
            with Vertical(id="task-list-body"):
                yield LoadingIndicator(id="task-list-loader")
                yield OptionList(id="task-option-list")
            yield Static("", id="task-list-feedback")

    def on_mount(self) -> None:
        option_list = self.query_one("#task-option-list", OptionList)
        option_list.display = False
        self.fetch_tasks()

    @work(thread=True)
    def fetch_tasks(self) -> None:
        try:
            response = api.get(f"/experiment/{self.experiment_id}/task/list")
            if response.status_code == 200:
                data = response.json()
            else:
                data = []
        except Exception:
            data = []

        self.app.call_from_thread(self.populate_tasks, data)

    def populate_tasks(self, tasks: list[dict]) -> None:
        loader = self.query_one("#task-list-loader", LoadingIndicator)
        loader.display = False

        feedback = self.query_one("#task-list-feedback", Static)
        option_list = self.query_one("#task-option-list", OptionList)
        option_list.display = True

        if not tasks:
            feedback.update("[yellow]No tasks found.[/yellow]")
            return

        self.tasks_data = tasks
        option_list.clear_options()
        print("[DEBUG] Populating tasks:", tasks)
        for task in tasks:
            task_id = task.get("id", "?")
            task_name = task.get("name", "Unknown")
            task_type = task.get("type", "N/A")
            option_list.add_option(Option(f"{task_name}", id=task_id))

    @on(OptionList.OptionSelected, "#task-option-list")
    def on_task_selected(self, event: OptionList.OptionSelected) -> None:
        if event.option_id:
            task = next((t for t in self.tasks_data if t.get("id") == event.option_id), None)
            if task:
                self.app.push_screen(TaskQueueModal(task))
