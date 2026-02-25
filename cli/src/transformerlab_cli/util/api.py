import json
import httpx
import typer
from rich import print


from transformerlab_cli.util.shared import BASE_URL
from transformerlab_cli.util.auth import api_key
from transformerlab_cli.util.config import get_config


def _request_headers() -> dict:
    """Build request headers: Authorization and optional X-Team-Id from config."""
    headers: dict = {"Authorization": f"Bearer {api_key}"}
    team_id = get_config("team_id")
    if team_id:
        headers["X-Team-Id"] = str(team_id)
    return headers


def get(path: str, timeout: float = 10.0, follow_redirects: bool = True) -> httpx.Response:
    """
    Makes a GET HTTP request to the specified URL.

    Args:
        path (str): The API path to send the request to.
        timeout (float): Request timeout in seconds. Default is 10.0.
        follow_redirects (bool): Whether to follow redirects. Default is True.

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    with httpx.Client(timeout=timeout) as client:
        response = client.request(
            method="GET",
            url=f"{BASE_URL()}{path}",
            headers=_request_headers(),
            follow_redirects=follow_redirects,
        )
    return response


def post(path: str, data: dict = None, files: dict = None, timeout: float = 60.0) -> httpx.Response:
    """
    Makes a POST HTTP request to the specified URL with the given data and files.

    Args:
        url (str): The URL to send the request to.
        data (dict, optional): The data to include in the POST request. Default is None.
        files (dict, optional): The files to include in the POST request. Default is None.
        timeout (float): Request timeout in seconds. Default is 60.0.

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    with httpx.Client(timeout=timeout) as client:
        response = client.request(
            method="POST",
            url=f"{BASE_URL()}{path}",
            headers=_request_headers(),
            data=data,
            files=files,
        )
    return response


def post_json(path: str, json_data: dict = None, timeout: float = 60.0) -> httpx.Response:
    """
    Makes a POST HTTP request with JSON body.

    Args:
        path (str): The API path to send the request to.
        json_data (dict, optional): The JSON data to include in the POST request.
        timeout (float): Request timeout in seconds. Default is 60.0.

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    with httpx.Client(timeout=timeout) as client:
        response = client.request(
            method="POST",
            url=f"{BASE_URL()}{path}",
            headers=_request_headers(),
            json=json_data,
        )
    return response


def check_server_status():
    """Check the status of the server."""
    try:
        response = get("/server/info")
        response.raise_for_status()
        status = response.json()
        print(json.dumps(status, indent=2))

    except httpx.HTTPError as e:
        print(f"[red]Error:[/red] Unable to connect to the server: {e}")
        raise typer.Exit(1)
