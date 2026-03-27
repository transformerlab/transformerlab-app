import os
import httpx

from transformerlab_cli.util.shared import CREDENTIALS_DIR, CREDENTIALS_FILE, AUTH_URL
from transformerlab_cli.util.ui import console


def set_api_key(api_key: str) -> bool:
    """
    Validate and save the API key.
    Returns True if successful, False otherwise.
    """
    try:
        os.makedirs(CREDENTIALS_DIR, exist_ok=True)
    except PermissionError:
        console.print(f"[error]Error:[/error] Cannot create directory {CREDENTIALS_DIR}")
        return False
    except OSError as e:
        console.print(f"[error]Error:[/error] Failed to create directory: {e}")
        return False

    key_response = test_api_key_on_remote_server(api_key)

    if key_response is None:
        # Connection error already handled in test_api_key_on_remote_server
        return False

    if key_response.status_code == 200:
        try:
            with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
                f.write(api_key)
            console.print("[success]✓[/success] API key validated and saved locally.")
            return True
        except PermissionError:
            console.print(f"[error]Error:[/error] Cannot write to {CREDENTIALS_FILE}")
            return False
        except OSError as e:
            console.print(f"[error]Error:[/error] Failed to save credentials: {e}")
            return False
    elif key_response.status_code == 401:
        console.print("[error]Error:[/error] Invalid API key")
        return False
    elif key_response.status_code == 403:
        console.print("[error]Error:[/error] API key is not authorized")
        return False
    else:
        console.print(f"[error]Error:[/error] Server returned status {key_response.status_code}")
        return False


def delete_api_key() -> bool:
    """
    Delete the saved API key.
    Returns True if successful, False otherwise.
    """
    if not os.path.exists(CREDENTIALS_FILE):
        console.print("[warning]No credentials file found[/warning]")
        return True

    try:
        os.unlink(CREDENTIALS_FILE)
        console.print("[success]✓[/success] Logged out successfully")
        return True
    except PermissionError:
        console.print(f"[error]Error:[/error] Cannot delete {CREDENTIALS_FILE}")
        return False
    except OSError as e:
        console.print(f"[error]Error:[/error] Failed to delete credentials: {e}")
        return False


def get_api_key() -> str | None:
    """
    Retrieve the saved API key.
    Returns the API key string or None if not found.
    """
    if not os.path.exists(CREDENTIALS_FILE):
        return None
    try:
        with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return None


def test_api_key_on_remote_server(api_key: str) -> httpx.Response | None:
    """
    Test the provided API key against the remote server.
    Returns response object or None on connection error.
    """
    with console.status("[bold info]Testing API key...", spinner="dots"):
        try:
            response = httpx.get(
                AUTH_URL(),
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10.0,
            )
            return response
        except httpx.RequestError as e:
            console.print(f"[error]Error:[/error] Could not connect to server: {e}")
            return None


def fetch_user_info(api_key: str) -> dict | None:
    """
    Fetch current user information from /users/me endpoint.
    Returns user info dict or None on error.
    """
    from transformerlab_cli.util.shared import BASE_URL

    try:
        response = httpx.get(
            f"{BASE_URL()}/users/me",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10.0,
        )
        response.raise_for_status()
        return response.json()
    except httpx.RequestError as e:
        console.print(f"[error]Error:[/error] Could not fetch user info: {e}")
        return None
    except httpx.HTTPStatusError as e:
        console.print(f"[error]Error:[/error] Server returned status {e.response.status_code}")
        return None


def fetch_user_teams(api_key: str) -> dict | None:
    """
    Fetch user teams from /users/me/teams endpoint.
    Returns teams info dict or None on error.
    """
    from transformerlab_cli.util.shared import BASE_URL

    try:
        response = httpx.get(
            f"{BASE_URL()}/users/me/teams",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10.0,
        )
        response.raise_for_status()
        return response.json()
    except httpx.RequestError as e:
        console.print(f"[error]Error:[/error] Could not fetch teams info: {e}")
        return None
    except httpx.HTTPStatusError as e:
        console.print(f"[error]Error:[/error] Server returned status {e.response.status_code}")
        return None


api_key = get_api_key()
