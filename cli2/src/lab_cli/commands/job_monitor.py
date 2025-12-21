from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, ListView, ListItem, Static, Label
from textual.containers import Horizontal, Vertical


FAKE_JOBS = [
    {"id": 1, "name": "Training GPT-2", "status": "Running", "progress": 45, "experiment": "nlp-experiment"},
    {"id": 2, "name": "Fine-tune BERT", "status": "Complete", "progress": 100, "experiment": "classification"},
    {"id": 3, "name": "Eval LLaMA", "status": "Pending", "progress": 0, "experiment": "benchmark"},
    {"id": 4, "name": "Export Model", "status": "Failed", "progress": 78, "experiment": "deployment"},
    {"id": 5, "name": "Dataset Prep", "status": "Running", "progress": 23, "experiment": "data-pipeline"},
]


class JobListItem(ListItem):
    def __init__(self, job: dict) -> None:
        super().__init__()
        self.job = job

    def compose(self) -> ComposeResult:
        yield Label(f"[{self.job['id']}] {self.job['name']}")


class JobDetails(Static):
    def __init__(self) -> None:
        super().__init__()
        self.job = None

    def set_job(self, job: dict) -> None:
        self.job = job
        self.refresh()

    def render(self) -> str:
        if not self.job:
            return "Select a job to view details"
        return (
            f"[bold]Job Details[/bold]\n\n"
            f"[cyan]ID:[/cyan] {self.job['id']}\n"
            f"[cyan]Name:[/cyan] {self.job['name']}\n"
            f"[cyan]Status:[/cyan] {self.job['status']}\n"
            f"[cyan]Progress:[/cyan] {self.job['progress']}%\n"
            f"[cyan]Experiment:[/cyan] {self.job['experiment']}"
        )


class JobMonitorApp(App):
    CSS = """
    Horizontal {
        height: 100%;
    }
    ListView {
        width: 40%;
        border: solid green;
    }
    JobDetails {
        width: 60%;
        border: solid blue;
        padding: 1 2;
    }
    """

    BINDINGS = [
        ("q", "quit", "Quit"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal():
            with ListView(id="job-list"):
                for job in FAKE_JOBS:
                    yield JobListItem(job)
            yield JobDetails()
        yield Footer()

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if isinstance(event.item, JobListItem):
            details = self.query_one(JobDetails)
            details.set_job(event.item.job)


def run_monitor() -> None:
    app = JobMonitorApp()
    app.run()
