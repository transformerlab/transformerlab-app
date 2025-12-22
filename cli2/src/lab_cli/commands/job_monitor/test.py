from lab_cli.util.config import get_current_experiment
from textual import on, work
from textual.app import App, ComposeResult
from textual.widgets import Header, Select
from lab_cli.util import api

LINES = """I must not fear.
Fear is the mind-killer.
Fear is the little-death that brings total obliteration.
I will face my fear.
I will permit it to pass over me and through me.""".splitlines()


class SelectApp(App):
    def compose(self) -> ComposeResult:
        yield Header()
        yield Select.from_values(LINES)
        experiment_options: reactive[list[tuple[str, str]] | None] = reactive(None)

    @on(Select.Changed)
    def select_changed(self, event: Select.Changed) -> None:
        pass

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


if __name__ == "__main__":
    app = SelectApp()
    app.run()
