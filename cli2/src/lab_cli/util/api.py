import httpx

from lab_cli.util.shared import BASE_URL


def call(path: str, method: str = "GET") -> httpx.Response:
    """
    Makes an HTTP request to the specified URL with the given method, headers, data, and parameters.

    Args:
        url (str): The URL to send the request to.
        method (str): The HTTP method to use (e.g., 'GET', 'POST', etc.). Default is 'GET'.
        headers (dict): Optional HTTP headers to include in the request.
        data (dict): Optional data to include in the body of the request (for POST, PUT, etc.).
        params (dict): Optional query parameters to include in the URL.
        timeout (int): Timeout for the request in seconds. Default is 10 seconds.

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    with httpx.Client(timeout=10.0) as client:
        response = client.request(method=method, url=f"{BASE_URL}{path}")
    return response
