import httpx

from lab_cli.util.shared import BASE_URL
from lab_cli.util.auth import api_key


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
            url=f"{BASE_URL}{path}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
    return response
