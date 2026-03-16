from __future__ import annotations

from typing import Optional

from textual import work
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, DataTable, Label, LoadingIndicator

from transformerlab_cli.util import api
from transformerlab_cli.util.config import get_current_experiment


class GalleryModal(ModalScreen[Optional[str]]):
    """Browse and import from the task gallery."""

    DEFAULT_CSS = """
    GalleryModal {
        align: center middle;
    }
    #gallery-modal {
        width: 70%;
        height: 80%;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    #gallery-table {
        height: 1fr;
    }
    #gallery-buttons {
        height: auto;
        margin-top: 1;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self) -> None:
        super().__init__()
        self.gallery_items: list[dict] = []
        self.selected_id: Optional[str] = None

    def compose(self) -> ComposeResult:
        with Vertical(id="gallery-modal"):
            yield Label("[bold]Task Gallery[/bold]")
            yield LoadingIndicator(id="gallery-loader")
            yield DataTable(id="gallery-table")
            with Vertical(id="gallery-buttons"):
                yield Button("Import Selected", id="btn-import", variant="primary", disabled=True)
                yield Button("Close", id="btn-close", variant="default")
            yield Label("", id="gallery-status")

    def on_mount(self) -> None:
        table = self.query_one("#gallery-table", DataTable)
        table.add_columns("ID", "Name", "Type", "Description")
        table.display = False
        self._fetch_gallery()

    @work(thread=True)
    def _fetch_gallery(self) -> None:
        experiment_id = get_current_experiment() or "alpha"
        try:
            response = api.get(f"/experiment/{experiment_id}/task/gallery")
            if response.status_code == 200:
                data = response.json()
                items = data.get("data", data) if isinstance(data, dict) else data
            else:
                items = []
        except Exception:
            items = []
        self.app.call_from_thread(self._populate_gallery, items)

    def _populate_gallery(self, items: list[dict]) -> None:
        loader = self.query_one("#gallery-loader", LoadingIndicator)
        loader.display = False
        table = self.query_one("#gallery-table", DataTable)
        table.display = True

        self.gallery_items = items
        for item in items:
            table.add_row(
                str(item.get("id", "")),
                item.get("name", ""),
                item.get("type", ""),
                item.get("description", "")[:60],
                key=str(item.get("id", "")),
            )

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        self.selected_id = str(event.row_key.value) if event.row_key else None
        btn = self.query_one("#btn-import", Button)
        btn.disabled = self.selected_id is None

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-close":
            self.dismiss(None)
        elif event.button.id == "btn-import" and self.selected_id:
            self._do_import()

    @work(thread=True)
    def _do_import(self) -> None:
        experiment_id = get_current_experiment() or "alpha"
        payload = {
            "gallery_id": self.selected_id,
            "experiment_id": experiment_id,
            "is_interactive": False,
        }
        try:
            response = api.post_json(f"/experiment/{experiment_id}/task/gallery/import", payload)
            if response.status_code == 200:
                task_id = response.json().get("id")
                self.app.call_from_thread(self.dismiss, str(task_id))
            else:
                self.app.call_from_thread(self.dismiss, None)
        except Exception:
            self.app.call_from_thread(self.dismiss, None)

