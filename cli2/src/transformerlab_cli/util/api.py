import json
import httpx
import typer
from rich import print


from transformerlab_cli.util.shared import BASE_URL
from transformerlab_cli.util.auth import api_key


def get(path: str) -> httpx.Response:
    """
    Makes an HTTP request to the specified URL with the given method, headers, data, and parameters.

    Args:
        url (str): The URL to send the request to.
        method (str): The HTTP method to use (e.g., 'GET', 'POST', etc.). Default is 'GET'.

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    with httpx.Client(timeout=10.0) as client:
        response = client.request(
            method="GET",
            url=f"{BASE_URL()}{path}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
    return response


def post(path: str, data: dict = None, files: dict = None) -> httpx.Response:
    """
    Makes a POST HTTP request to the specified URL with the given data and files.

    Args:
        url (str): The URL to send the request to.
        data (dict, optional): The data to include in the POST request. Default is None.
        files (dict, optional): The files to include in the POST request. Default is None.

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    with httpx.Client(timeout=10.0) as client:
        response = client.request(
            method="POST",
            url=f"{BASE_URL()}{path}",
            headers={"Authorization": f"Bearer {api_key}"},
            data=data,
            files=files,
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
