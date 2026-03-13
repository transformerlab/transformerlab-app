from textual.app import ComposeResult
from textual.widgets import (
    Static,
    Label,
    LoadingIndicator,
    Button,
    OptionList,
    Input,
    Select,
)
from textual.widgets.option_list import Option
from textual.containers import Vertical, ScrollableContainer
from textual.screen import ModalScreen
from textual import work, on

from transformerlab_cli.util import api
from transformerlab_cli.util.config import get_current_experiment
from transformerlab_cli.commands.task import fetch_providers, launch_task_on_provider


class InteractiveTaskConfigModal(ModalScreen):
    """Modal for configuring and launching an interactive task."""

    DEFAULT_CSS = """
    InteractiveTaskConfigModal {
        align: center middle;
    }
    #interactive-config-modal {
        width: 60%;
        min-width: 50;
        max-height: 80%;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    #interactive-form-container {
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
    #interactive-submit-btn {
        margin-top: 1;
        width: 100%;
    }
    #interactive-spinner {
        height: 3;
        display: none;
    }
    #interactive-status {
        text-align: center;
        height: auto;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self, gallery_entry: dict, provider: dict) -> None:
        super().__init__()
        self.gallery_entry = gallery_entry
        self.provider = provider
        self.param_widgets: dict[str, str] = {}
        self.is_local = provider.get("type") == "local"

    def compose(self) -> ComposeResult:
        name = self.gallery_entry.get("name", "Unknown")
        env_parameters = self._filtered_env_params()

        with Vertical(id="interactive-config-modal"):
            yield Label(f"[b]Launch: {name}[/b]")
            yield Label(f"[dim]{self.gallery_entry.get('description', '')}[/dim]")

            with ScrollableContainer(id="interactive-form-container"):
                if not env_parameters:
                    yield Label("[dim]No configuration needed[/dim]")
                else:
                    yield Label("[b]Configuration[/b]")
                    for param in env_parameters:
                        yield from self._render_param_field(param)

            yield Button("Launch", id="interactive-submit-btn", variant="primary")
            yield LoadingIndicator(id="interactive-spinner")
            yield Label("", id="interactive-status")

    def _filtered_env_params(self) -> list[dict]:
        """Return env_parameters, filtering out NGROK for local providers."""
        params = self.gallery_entry.get("env_parameters", [])
        if self.is_local:
            params = [p for p in params if p.get("env_var") != "NGROK_AUTH_TOKEN"]
        return params

    def _render_param_field(self, param: dict) -> ComposeResult:
        env_var = param.get("env_var", "")
        field_name = param.get("field_name", env_var)
        is_password = param.get("password", False)
        widget_id = f"iparam-{env_var}"
        self.param_widgets[env_var] = widget_id

        # Smart default: use placeholder value, override for NGROK on remote
        default = param.get("placeholder", "")
        if not self.is_local and env_var == "NGROK_AUTH_TOKEN":
            default = "{{secret._NGROK_AUTH_TOKEN}}"

        help_text = param.get("help_text", "")
        with Vertical(classes="form-row"):
            yield Label(f"{field_name}:", classes="form-label")
            yield Input(
                value=default,
                password=is_password,
                id=widget_id,
                classes="form-input",
            )
            if help_text:
                yield Label(f"[dim]{help_text}[/dim]", classes="form-label")

    def _collect_env_vars(self) -> dict[str, str]:
        env_vars: dict[str, str] = {}
        for env_var, widget_id in self.param_widgets.items():
            try:
                widget = self.query_one(f"#{widget_id}", Input)
                if widget.value:
                    env_vars[env_var] = widget.value
            except Exception:
                pass
        return env_vars

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "interactive-submit-btn":
            self._show_spinner(True, "Importing and launching...")
            self._do_launch()

    def _show_spinner(self, show: bool, message: str = "") -> None:
        spinner = self.query_one("#interactive-spinner", LoadingIndicator)
        status = self.query_one("#interactive-status", Label)
        button = self.query_one("#interactive-submit-btn", Button)
        spinner.display = show
        button.display = not show
        status.update(message)

    @work(thread=True)
    def _do_launch(self) -> None:
        env_vars = self._collect_env_vars()
        experiment_id = get_current_experiment() or "alpha"
        gallery_entry = self.gallery_entry
        provider = self.provider

        try:
            # Import task
            import_payload = {
                "gallery_id": gallery_entry.get("id"),
                "experiment_id": experiment_id,
                "is_interactive": True,
                "env_vars": env_vars,
            }
            resp = api.post_json(f"/experiment/{experiment_id}/task/gallery/import", import_payload)
            if resp.status_code != 200:
                raise RuntimeError(f"Import failed: {resp.text}")
            task_id = resp.json().get("id")

            # Fetch the imported task to get resolved run/setup from task.yaml
            # Task fields are stored flat (not nested under "config").
            imported_task: dict = {}
            tasks_resp = api.get(f"/experiment/{experiment_id}/task/list_by_type_in_experiment?type=REMOTE")
            if tasks_resp.status_code == 200:
                for t in tasks_resp.json():
                    if str(t.get("id")) == str(task_id):
                        imported_task = t
                        break

            run = imported_task.get("run", "") or gallery_entry.get("command", "")
            setup = imported_task.get("setup", "") or gallery_entry.get("setup", "")

            # Build launch payload
            is_local = provider.get("type") == "local"
            launch_payload = {
                "experiment_id": experiment_id,
                "task_id": str(task_id),
                "task_name": gallery_entry.get("name", "Interactive Task"),
                "cluster_name": imported_task.get("cluster_name", gallery_entry.get("name", "Interactive Task")),
                "run": run,
                "setup": setup,
                "subtype": "interactive",
                "interactive_type": gallery_entry.get("interactive_type", "custom"),
                "interactive_gallery_id": gallery_entry.get("id"),
                "local": is_local,
                "env_vars": env_vars,
                "provider_name": provider.get("name"),
                "github_repo_url": imported_task.get("github_repo_url"),
                "github_repo_dir": imported_task.get("github_directory"),
                "github_repo_branch": imported_task.get("github_branch"),
            }

            data = launch_task_on_provider(provider.get("id"), launch_payload)
            job_id = data.get("job_id", "unknown")
            self.app.call_from_thread(
                self.notify, f"Interactive task launched. Job ID: {job_id}", severity="information"
            )
            self.app.call_from_thread(self._dismiss_all)
        except Exception as e:
            self.app.call_from_thread(self._show_spinner, False)
            self.app.call_from_thread(self.notify, str(e), severity="error")

    def _dismiss_all(self) -> None:
        """Dismiss this modal and the parent InteractiveTaskModal."""
        self.app.pop_screen()  # dismiss InteractiveTaskConfigModal
        self.app.pop_screen()  # dismiss InteractiveTaskModal


class InteractiveTaskModal(ModalScreen):
    """Modal listing interactive gallery templates for a given provider."""

    DEFAULT_CSS = """
    InteractiveTaskModal {
        align: center middle;
    }
    #interactive-list-modal {
        width: 60%;
        min-width: 50;
        height: 80%;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    #interactive-list-body {
        height: 1fr;
        margin-bottom: 1;
    }
    #interactive-option-list {
        height: 100%;
        min-height: 10;
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
        self.providers: list[dict] = []
        self.gallery: list[dict] = []
        self.filtered: list[dict] = []
        self.selected_provider: dict = {}

    def compose(self) -> ComposeResult:
        with Vertical(id="interactive-list-modal"):
            yield Label("[b]Launch Interactive Task[/b]")
            with Vertical(classes="form-row"):
                yield Label("Provider:", classes="form-label")
                yield Select(
                    [("Loading...", "_loading")],
                    value="_loading",
                    allow_blank=False,
                    id="interactive-provider-select",
                )
            with Vertical(id="interactive-list-body"):
                yield LoadingIndicator(id="interactive-loader")
                yield OptionList(id="interactive-option-list")
            yield Static("", id="interactive-feedback")

    def on_mount(self) -> None:
        self.query_one("#interactive-option-list", OptionList).display = False
        self._fetch_data()

    @work(thread=True)
    def _fetch_data(self) -> None:
        """Fetch providers and gallery in background."""
        providers = fetch_providers()
        experiment_id = get_current_experiment() or "alpha"
        try:
            resp = api.get(f"/experiment/{experiment_id}/task/gallery/interactive")
            gallery = resp.json().get("data", []) if resp.status_code == 200 else []
        except Exception:
            gallery = []
        self.app.call_from_thread(self._populate, providers, gallery)

    def _populate(self, providers: list[dict], gallery: list[dict]) -> None:
        self.providers = providers
        self.gallery = gallery

        loader = self.query_one("#interactive-loader", LoadingIndicator)
        loader.display = False

        provider_select = self.query_one("#interactive-provider-select", Select)
        if not providers:
            provider_select.set_options([("No providers", "_none")])
            provider_select.value = "_none"
            return

        self.selected_provider = providers[0]
        options = [(p.get("name", p.get("id")), p.get("id")) for p in providers]
        provider_select.set_options(options)
        provider_select.value = providers[0].get("id")
        self._filter_gallery()

    @on(Select.Changed, "#interactive-provider-select")
    def on_provider_changed(self, event: Select.Changed) -> None:
        if event.value and event.value != Select.BLANK:
            self.selected_provider = next((p for p in self.providers if p.get("id") == event.value), {})
            self._filter_gallery()

    def _filter_gallery(self) -> None:
        """Filter gallery entries by provider compatibility."""
        provider = self.selected_provider
        is_local = provider.get("type") == "local"

        provider_acc = set()
        acc = provider.get("supported_accelerators") or provider.get("accelerators")
        if isinstance(acc, str):
            provider_acc = {a.strip() for a in acc.split(",") if a.strip()}
        elif isinstance(acc, list):
            provider_acc = set(acc)

        self.filtered = []
        for entry in self.gallery:
            if is_local and entry.get("remoteOnly"):
                continue
            task_acc = entry.get("supported_accelerators", [])
            if isinstance(task_acc, str):
                task_acc = [a.strip() for a in task_acc.split(",") if a.strip()]
            if task_acc and provider_acc and not set(task_acc) & provider_acc:
                continue
            self.filtered.append(entry)

        option_list = self.query_one("#interactive-option-list", OptionList)
        option_list.display = True
        option_list.clear_options()

        feedback = self.query_one("#interactive-feedback", Static)
        if not self.filtered:
            feedback.update("[yellow]No compatible interactive tasks for this provider.[/yellow]")
            return
        feedback.update("")

        for entry in self.filtered:
            option_list.add_option(
                Option(f"{entry.get('name', '?')} - {entry.get('description', '')}", id=entry.get("id"))
            )

    @on(OptionList.OptionSelected, "#interactive-option-list")
    def on_template_selected(self, event: OptionList.OptionSelected) -> None:
        if event.option_id:
            entry = next((e for e in self.filtered if e.get("id") == event.option_id), None)
            if entry:
                self.app.push_screen(InteractiveTaskConfigModal(entry, self.selected_provider))
