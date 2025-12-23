import httpx
from rich.console import Console

from transformerlab_cli.util.shared import CREDENTIALS_DIR, CREDENTIALS_FILE, AUTH_URL

console = Console()


def set_api_key(api_key: str) -> bool:
    """
    Validate and save the API key.
    Returns True if successful, False otherwise.
    """
    try:
        CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        console.print(f"[red]Error:[/red] Cannot create directory {CREDENTIALS_DIR}")
        return False
    except OSError as e:
        console.print(f"[red]Error:[/red] Failed to create directory: {e}")
        return False

    key_response = test_api_key_on_remote_server(api_key)

    if key_response == 200:
        try:
            CREDENTIALS_FILE.write_text(api_key)
            console.print("[green]✓[/green] API key validated and saved locally.")
            return True
        except PermissionError:
            console.print(f"[red]Error:[/red] Cannot write to {CREDENTIALS_FILE}")
            return False
        except OSError as e:
            console.print(f"[red]Error:[/red] Failed to save credentials: {e}")
            return False
    elif key_response == 401:
        console.print("[red]Error:[/red] Invalid API key")
        return False
    elif key_response == 403:
        console.print("[red]Error:[/red] API key is not authorized")
        return False
    else:
        console.print(f"[red]Error:[/red] Server returned status {key_response}")
        return False


def delete_api_key() -> bool:
    """
    Delete the saved API key.
    Returns True if successful, False otherwise.
    """
    if not CREDENTIALS_FILE.exists():
        console.print("[yellow]No credentials file found[/yellow]")
        return True

    try:
        CREDENTIALS_FILE.unlink()
        console.print("[green]✓[/green] Logged out successfully")
        return True
    except PermissionError:
        console.print(f"[red]Error:[/red] Cannot delete {CREDENTIALS_FILE}")
        return False
    except OSError as e:
        console.print(f"[red]Error:[/red] Failed to delete credentials: {e}")
        return False


def get_api_key() -> str | None:
    """
    Retrieve the saved API key.
    Returns the API key string or None if not found.
    """
    if not CREDENTIALS_FILE.exists():
        return None
    try:
        return CREDENTIALS_FILE.read_text().strip()
    except OSError:
        return None


def test_api_key_on_remote_server(api_key: str) -> int:
    """
    Test the provided API key against the remote server.
    Returns response status code.
    """
    with console.status("[bold cyan]Testing API key...", spinner="dots"):
        try:
            response = httpx.get(
                AUTH_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10.0,
            )
        except httpx.RequestError as e:
            console.print(f"[red]Error:[/red] Could not connect to server: {e}")
            return False

    return response.status_code


api_key = get_api_key()
