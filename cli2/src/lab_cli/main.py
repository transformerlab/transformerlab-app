import typer
import typer.core
from rich.console import Console

from lab_cli.util.api import check_server_status
from lab_cli.util.logo import show_header
from lab_cli.util.config import check_configs, list_config, set_config

from lab_cli.commands.version import app as version_app
from lab_cli.commands.config import app as config_app
from lab_cli.commands.status import app as status_app
from lab_cli.commands.login import app as login_app
from lab_cli.commands.logout import app as logout_app
from lab_cli.commands.task import app as task_app
from lab_cli.commands.job import app as job_app  # Import job app


# 2. Create a Custom Group Class
class LogoTyperGroup(typer.core.TyperGroup):
    def format_help(self, ctx, formatter):
        """
        Override the help formatting to print a logo first.
        """
        console = Console()
        # Print the logo nicely using Rich
        show_header(console)

        # Call the parent method to print the standard help text
        return super().format_help(ctx, formatter)


app = typer.Typer(
    name="lab", help="Transformer Lab CLI", add_completion=False, no_args_is_help=True, cls=LogoTyperGroup
)
app.add_typer(version_app)
app.add_typer(config_app)
app.add_typer(status_app)
app.add_typer(login_app)
app.add_typer(logout_app)
app.add_typer(task_app, name="task", help="Task management commands", no_args_is_help=True)
app.add_typer(job_app, name="job", help="Job management commands", no_args_is_help=True)

console = Console()

# Global variable to store the output format
output_format: str = "pretty"


# Apply common setup to all commands
@app.callback()
def common_setup(
    ctx: typer.Context, format: str = typer.Option("pretty", "--format", help="Output format: pretty or json")
):
    """Common setup code to run before any command."""
    global output_format
    output_format = format  # Set the global output format (pretty or json)
    if not ctx.invoked_subcommand:
        show_header(console)  # Display the logo when no command is provided


if __name__ == "__main__":
    app()
