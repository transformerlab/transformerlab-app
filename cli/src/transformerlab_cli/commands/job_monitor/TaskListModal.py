from textual.app import ComposeResult
from textual.widgets import (
    Static,
    Label,
    LoadingIndicator,
    Button,
    OptionList,
    Input,
    Switch,
    Select,
)
from textual.widgets.option_list import Option
from textual.containers import Vertical, ScrollableContainer
from textual.screen import ModalScreen
from textual import work, on

from transformerlab_cli.util import api


def _infer_param_type(value) -> str:
    """Infer parameter type from a simple shorthand value."""
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    return "string"


def _normalize_param(key: str, value) -> dict:
    """Normalize a parameter definition to extended schema format."""
    if isinstance(value, dict) and "type" in value:
        schema = dict(value)
        schema.setdefault("title", key)
        return schema
    return {
        "type": _infer_param_type(value),
        "default": value,
        "title": key,
    }


class TaskQueueModal(ModalScreen):
    """A modal for configuring task queue options."""

    DEFAULT_CSS = """
    TaskQueueModal {
        align: center middle;
    }
    #queue-modal {
        width: 60%;
        min-width: 50;
        max-height: 80%;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    #queue-form-container {
        height: auto;
        max-height: 100%;
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
    .form-switch {
        height: auto;
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
        self.param_widgets: dict[str, str] = {}

    def compose(self) -> ComposeResult:
        task_name = self.task_info.get("name", "Unknown")
        parameters = self.task_info.get("parameters", {})

        with Vertical(id="queue-modal"):
            yield Label(f"[b]Queue Task: {task_name}[/b]")

            with ScrollableContainer(id="queue-form-container"):
                if not parameters:
                    yield Label("[dim]No configurable parameters[/dim]")
                else:
                    for key, raw_value in parameters.items():
                        schema = _normalize_param(key, raw_value)
                        yield from self._render_param_field(key, schema)

            yield Button("Queue", id="queue-submit-btn", variant="primary")

    def _render_param_field(self, key: str, schema: dict) -> ComposeResult:
        """Render a single parameter field based on its schema."""
        param_type = schema.get("type", "string")
        title = schema.get("title", key)
        default = schema.get("default", "")
        ui_widget = schema.get("ui_widget")
        options = schema.get("options", [])

        widget_id = f"param-{key}"
        self.param_widgets[key] = widget_id

        with Vertical(classes="form-row"):
            yield Label(f"{title}:", classes="form-label")

            if param_type == "bool":
                yield Switch(value=bool(default), id=widget_id, classes="form-switch")

            elif param_type == "enum" or (ui_widget == "select" and options):
                select_options = [(opt, opt) for opt in options]
                yield Select(
                    select_options,
                    value=str(default) if default else Select.BLANK,
                    id=widget_id,
                    classes="form-input",
                )

            elif ui_widget == "password":
                yield Input(
                    value=str(default) if default else "",
                    password=True,
                    id=widget_id,
                    classes="form-input",
                )

            else:
                placeholder = ""
                if param_type == "int":
                    placeholder = f"Integer (default: {default})"
                elif param_type == "float":
                    placeholder = f"Float (default: {default})"
                else:
                    placeholder = f"default: {default}" if default else ""

                yield Input(
                    value=str(default) if default else "",
                    placeholder=placeholder,
                    id=widget_id,
                    classes="form-input",
                )

    def _collect_param_values(self) -> dict:
        """Collect current values from all parameter widgets."""
        values = {}
        parameters = self.task_info.get("parameters", {})

        for key, raw_value in parameters.items():
            schema = _normalize_param(key, raw_value)
            widget_id = self.param_widgets.get(key)
            if not widget_id:
                continue

            try:
                widget = self.query_one(f"#{widget_id}")
            except Exception:
                continue

            if isinstance(widget, Switch):
                values[key] = widget.value
            elif isinstance(widget, Select):
                values[key] = widget.value if widget.value != Select.BLANK else schema.get("default", "")
            elif isinstance(widget, Input):
                raw = widget.value
                param_type = schema.get("type", "string")
                if param_type == "int":
                    try:
                        values[key] = int(raw) if raw else schema.get("default", 0)
                    except ValueError:
                        values[key] = schema.get("default", 0)
                elif param_type == "float":
                    try:
                        values[key] = float(raw) if raw else schema.get("default", 0.0)
                    except ValueError:
                        values[key] = schema.get("default", 0.0)
                else:
                    values[key] = raw if raw else schema.get("default", "")

        return values

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "queue-submit-btn":
            param_values = self._collect_param_values()
            self.notify(f"Queue functionality not implemented yet. Params: {param_values}", severity="information")
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
            # task_type = task.get("type", "N/A")
            option_list.add_option(Option(f"{task_name}", id=task_id))

    @on(OptionList.OptionSelected, "#task-option-list")
    def on_task_selected(self, event: OptionList.OptionSelected) -> None:
        if event.option_id:
            task = next((t for t in self.tasks_data if t.get("id") == event.option_id), None)
            if task:
                self.app.push_screen(TaskQueueModal(task))
