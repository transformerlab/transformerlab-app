import typer
import typer.core

from transformerlab_cli.util.logo import show_header
from transformerlab_cli.util.ui import console
from transformerlab_cli.util.version_check import check_for_update
from transformerlab_cli.state import cli_state  # Import the CLI state singleton

from transformerlab_cli.commands.version import app as version_app
from transformerlab_cli.commands.config import command_config
from transformerlab_cli.commands.status import app as status_app
from transformerlab_cli.commands.login import app as login_app
from transformerlab_cli.commands.logout import app as logout_app
from transformerlab_cli.commands.whoami import app as whoami_app
from transformerlab_cli.commands.task import app as task_app
from transformerlab_cli.commands.job import app as job_app
from transformerlab_cli.commands.provider import app as provider_app
from transformerlab_cli.commands.server import app as server_app
from transformerlab_cli.commands.experiment import app as experiment_app
from transformerlab_cli.commands.notes import app as notes_app
from transformerlab_cli.commands.dataset import app as dataset_app
from transformerlab_cli.commands.model import app as model_app
from transformerlab_cli.commands.install_agent_skill import app as install_agent_skill_app


# Create custom Help screen so we can show the logo
class LogoTyperGroup(typer.core.TyperGroup):
    def format_help(self, ctx, formatter):
        """
        Override the help formatting to print a logo first.
        """
        show_header(console)

        # Call the parent method to print the standard help text
        return super().format_help(ctx, formatter)


app = typer.Typer(
    name="lab", help="Transformer Lab CLI", add_completion=False, no_args_is_help=True, cls=LogoTyperGroup
)
app.add_typer(version_app)
app.command("config")(command_config)
app.add_typer(status_app)
app.add_typer(login_app)
app.add_typer(logout_app)
app.add_typer(whoami_app)
app.add_typer(task_app, name="task", help="Task management commands", no_args_is_help=True)
app.add_typer(job_app, name="job", help="Job management commands", no_args_is_help=True)
app.add_typer(notes_app, name="notes", help="Experiment notes commands", no_args_is_help=True)
app.add_typer(provider_app, name="provider", help="Compute provider management commands", no_args_is_help=True)
app.add_typer(server_app, name="server", help="Server installation and configuration commands", no_args_is_help=True)
app.add_typer(dataset_app, name="dataset", help="Dataset management commands", no_args_is_help=True)
app.add_typer(model_app, name="model", help="Model management commands", no_args_is_help=True)
app.add_typer(experiment_app, name="experiment", help="Experiment management commands", no_args_is_help=True)
app.add_typer(install_agent_skill_app)


# Apply common setup to all commands
@app.callback()
def common_setup(
    ctx: typer.Context, format: str = typer.Option("pretty", "--format", help="Output format: pretty or json")
):
    """Common setup code to run before any command."""
    cli_state.output_format = format
    if not ctx.invoked_subcommand:
        show_header(console)  # Display the logo when no command is provided
    elif ctx.invoked_subcommand != "version" and format != "json":
        check_for_update(console)


if __name__ == "__main__":
    app()
