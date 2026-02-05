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
        height: 1fr;
        max-height: 20;
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
        self.providers: list[dict] = []
        self.selected_provider_id: str = task_info.get("provider_id", "")

    def compose(self) -> ComposeResult:
        task_name = self.task_info.get("name", "Unknown")
        parameters = self.task_info.get("parameters", {})

        with Vertical(id="queue-modal"):
            yield Label(f"[b]Queue Task: {task_name}[/b]")

            with Vertical(classes="form-row"):
                yield Label("Provider:", classes="form-label")
                yield Select(
                    [("Loading...", "_loading")],
                    value="_loading",
                    allow_blank=False,
                    id="provider-select",
                    classes="form-input",
                )
                # yield Label("[DEBUG] Selected: (none)", id="debug-provider-label")

            with ScrollableContainer(id="queue-form-container"):
                yield Label("[b]Task Parameters[/b]")
                if not parameters:
                    yield Label("[dim]No configurable parameters[/dim]")
                else:
                    for key, raw_value in parameters.items():
                        schema = _normalize_param(key, raw_value)
                        yield from self._render_param_field(key, schema)

            yield Button("Queue", id="queue-submit-btn", variant="primary")

    def on_mount(self) -> None:
        self.fetch_providers()

    @work(thread=True)
    def fetch_providers(self) -> None:
        """Fetch available compute providers from the API."""
        try:
            response = api.get("/compute_provider/")
            if response.status_code == 200:
                providers = response.json()
            else:
                providers = []
        except Exception:
            providers = []

        self.app.call_from_thread(self.populate_providers, providers)

    def populate_providers(self, providers: list[dict]) -> None:
        """Populate the provider select widget."""
        self.providers = providers
        provider_select = self.query_one("#provider-select", Select)

        if not providers:
            with provider_select.prevent(Select.Changed):
                provider_select.set_options([("No providers available", "_none")])
                provider_select.value = "_none"
            return

        options = [(p.get("name", p.get("id")), p.get("id")) for p in providers]

        task_provider_id = self.task_info.get("provider_id", "")
        if task_provider_id and any(p.get("id") == task_provider_id for p in providers):
            initial_value = task_provider_id
        else:
            initial_value = providers[0].get("id")

        with provider_select.prevent(Select.Changed):
            provider_select.set_options(options)
            provider_select.value = initial_value

        self.selected_provider_id = initial_value
        # self._update_debug_label(initial_value)

    # def _update_debug_label(self, value: str) -> None:
    #     """Update the debug label with current selection."""
    #     try:
    #         debug_label = self.query_one("#debug-provider-label", Label)
    #         provider_name = next((p.get("name") for p in self.providers if p.get("id") == value), value)
    #         debug_label.update(f"[DEBUG] Selected: {provider_name} (id={value})")
    #     except Exception:
    #         pass

    @on(Select.Changed, "#provider-select")
    def on_provider_changed(self, event: Select.Changed) -> None:
        if event.value != Select.BLANK:
            self.selected_provider_id = str(event.value)
            # self._update_debug_label(str(event.value))

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
            self.queue_task()

    @work(thread=True)
    def queue_task(self) -> None:
        """Queue the task by calling the provider launch endpoint."""
        param_values = self._collect_param_values()
        task = self.task_info

        provider_id = self.selected_provider_id
        if not provider_id:
            self.app.call_from_thread(
                self.notify, "Please select a provider before queuing.", severity="error"
            )
            return

        selected_provider = next((p for p in self.providers if p.get("id") == provider_id), None)
        provider_name = selected_provider.get("name") if selected_provider else task.get("provider_name")

        payload = {
            "experiment_id": task.get("experiment_id"),
            "task_id": task.get("id"),
            "task_name": task.get("name"),
            "command": task.get("command"),
            "setup": task.get("setup"),
            "accelerators": task.get("accelerators"),
            "env_vars": task.get("env_vars", {}),
            "parameters": task.get("parameters", {}),
            "config": param_values if param_values else None,
            "provider_name": provider_name,
            "github_repo_url": task.get("github_repo_url"),
            "github_directory": task.get("github_directory"),
        }

        try:
            response = api.post_json(f"/compute_provider/{provider_id}/task/launch", payload)
            if response.status_code == 200:
                data = response.json()
                job_id = data.get("job_id", "unknown")
                self.app.call_from_thread(
                    self.notify, f"Task queued successfully. Job ID: {job_id}", severity="information"
                )
            else:
                detail = response.json().get("detail", response.text) if response.text else "Unknown error"
                self.app.call_from_thread(
                    self.notify, f"Failed to queue task: {detail}", severity="error"
                )
        except Exception as e:
            self.app.call_from_thread(
                self.notify, f"Error queuing task: {e}", severity="error"
            )

        self.app.call_from_thread(self.dismiss)


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
