import json
import os
from textual.app import ComposeResult
from textual.widgets import Button, TextArea, ProgressBar, Static
from textual.containers import Vertical, VerticalScroll, Horizontal
from textual.screen import ModalScreen
from textual import work
from transformerlab_cli.util import api
from transformerlab_cli.util.config import check_configs


def log_to_file(message: str) -> None:
    with open("job_details_log.txt", "a") as log_file:
        log_file.write(message + "\n")


class JobJsonModal(ModalScreen):
    """
    A modal that displays the Job JSON in a selectable TextArea.
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self, job: dict) -> None:
        super().__init__()
        self.job = job

    def compose(self) -> ComposeResult:
        json_str = json.dumps(self.job, indent=2, default=str)

        with Vertical(id="json-modal-container"):
            yield TextArea(json_str, language="json", theme="dracula", read_only=True)
            yield Button("Close", id="btn-close-modal")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-close-modal":
            self.dismiss()


class JobDetails(Vertical):
    def __init__(self) -> None:
        super().__init__()
        self.current_job = None

    def compose(self) -> ComposeResult:
        # 1. Progress Bar at top
        yield ProgressBar(total=100, show_eta=False, id="job-progress")

        # 2. Info Scroll Container (Top half)
        with VerticalScroll(id="job-info-container"):
            yield Static("", id="job-info")

        # 3. Artifacts Scroll Container (Middle)
        with VerticalScroll(id="job-artifacts-container"):
            yield Static("[bold]Artifacts:[/bold]\nNo artifacts available.", id="job-artifacts")

        # 4. Buttons (Bottom)
        with Horizontal(id="job-buttons"):
            yield Button("View Job Details", id="btn-view-json", variant="primary")
            yield Button("Download All Artifacts", id="btn-download", variant="primary")

    def set_job(self, job: dict) -> None:
        self.current_job = job

        progress_bar = self.query_one("#job-progress", ProgressBar)
        progress_bar.update(progress=job.get("progress", 0))
        progress_bar.add_class("visible")

        job_data = job.get("job_data", {})
        details = (
            f"[bold]{job_data.get('task_name', 'N/A')}[/bold]\n\n"
            f"[$primary]ID:[/$primary] {job.get('id', 'N/A')}\n"
            f"[$primary]Task Name:[/$primary] {job_data.get('task_name', 'N/A')}\n"
            f"[$primary]Status:[/$primary] {job.get('status', 'N/A')}\n"
            f"[$primary]Progress:[/$primary] {job.get('progress', 0)}%\n"
            f"[$primary]Experiment:[/$primary] {job.get('experiment_id', 'N/A')}\n"
            f"[$primary]Model:[/$primary] {job_data.get('model_name', 'N/A')}\n"
            f"[$primary]Cluster:[/$primary] {job_data.get('cluster_name', 'N/A')}\n"
            f"[$primary]Completion:[/$primary] {job_data.get('completion_status', 'N/A')}"
        )

        details_view = self.query_one("#job-info", Static)
        details_view.update(details)

        # Make buttons visible
        buttons = self.query_one("#job-buttons")
        buttons.add_class("visible")

        # Update artifacts panel
        artifacts = job.get("job_data", {}).get("artifacts", [])

        artifacts_text = ""

        if artifacts:
            # Markdown list syntax
            # Iterate through each artifact:
            for artifact in artifacts:
                # artifacts are long names like s3://workspace-8359c7c6-b1a4-4f50-a5ce-1a68a95da010/jobs/15/artifacts/training_config.json
                # we want just the last part:
                artifact_name = artifact.split("/")[-1]
                artifacts_text = artifacts_text + f"• {artifact_name}\n"
        else:
            # Markdown italic syntax is *text*, not [italic]text[/italic]
            artifacts_text = "*No artifacts available*"

        artifacts_view = self.query_one("#job-artifacts", Static)

        final_text = f"[bold]Artifacts:[/bold]\n\n{artifacts_text}"
        artifacts_view.update(final_text)

        # Make artifacts container visible
        artifacts_container = self.query_one("#job-artifacts-container", VerticalScroll)
        artifacts_container.add_class("visible")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-view-json":
            if self.current_job:
                self.app.push_screen(JobJsonModal(self.current_job))
        elif event.button.id == "btn-download":
            if self.current_job:
                job_id = str(self.current_job.get("id", ""))
                if job_id:
                    self.download_artifacts(job_id)
                else:
                    self.notify("Invalid job ID", severity="error")
            else:
                self.notify("No job selected", severity="warning")

    @work(thread=True, exclusive=True)
    def download_artifacts(self, job_id: str) -> None:
        """Download all artifacts for a job in a background thread."""
        try:
            # Check configs first
            try:
                check_configs()
            except Exception as e:
                self.notify(f"Configuration error: {str(e)}", severity="error")
                return

            # Determine output directory (current working directory)
            output_dir = os.getcwd()
            filename = f"artifacts_{job_id}.zip"
            output_path = os.path.join(output_dir, filename)

            # Make the API request
            try:
                response = api.get(f"/jobs/{job_id}/artifacts/download_all", timeout=300.0)
            except Exception as e:
                self.notify(f"Failed to connect to server: {str(e)}", severity="error")
                return

            if response.status_code == 200:
                # Get filename from Content-Disposition header if available
                content_disposition = response.headers.get("Content-Disposition", "")
                if "filename=" in content_disposition:
                    filename_part = content_disposition.split("filename=")[1].strip('"')
                    if filename_part:
                        filename = filename_part
                        output_path = os.path.join(output_dir, filename)

                # Write the file
                try:
                    with open(output_path, "wb") as f:
                        f.write(response.content)
                    self.notify(
                        f"Successfully downloaded artifacts to: {output_path}",
                        severity="success",
                        timeout=5.0,
                    )
                except Exception as e:
                    self.notify(f"Failed to write file: {str(e)}", severity="error")
            elif response.status_code == 404:
                self.notify(f"No artifacts found for job {job_id}", severity="warning")
            else:
                error_msg = f"Failed to download artifacts (status: {response.status_code})"
                try:
                    if response.text:
                        error_msg += f": {response.text[:100]}"
                except Exception:
                    pass
                self.notify(error_msg, severity="error")
        except Exception as e:
            self.notify(f"Download failed: {str(e)}", severity="error")
