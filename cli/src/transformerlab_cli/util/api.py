import json
import httpx
import typer

from transformerlab_cli.util.shared import BASE_URL
from transformerlab_cli.util.config import get_config
from transformerlab_cli.util.ui import console

_reraise_transport_errors: bool = False


def set_reraise_transport_errors(enabled: bool) -> None:
    """When True, HTTP transport errors propagate instead of exiting (job monitor TUI)."""
    global _reraise_transport_errors
    _reraise_transport_errors = enabled


def _should_reraise_transport(reraise_transport: bool | None) -> bool:
    if reraise_transport is not None:
        return reraise_transport
    return _reraise_transport_errors


def _request_headers() -> dict:
    """Build request headers: Authorization and optional X-Team-Id from config."""
    from transformerlab_cli.util.auth import get_api_key

    headers: dict = {"Authorization": f"Bearer {get_api_key()}"}
    team_id = get_config("team_id")
    if team_id:
        headers["X-Team-Id"] = str(team_id)
    return headers


def describe_request_error(exc: httpx.RequestError) -> str:
    """
    Summarize transport-layer failures (no HTTP response) for CLI users.

    Used when requests time out, connections are refused, DNS fails, etc.
    """
    try:
        url = str(exc.request.url) if exc.request is not None else BASE_URL()
    except Exception:
        url = BASE_URL()

    if isinstance(exc, httpx.TimeoutException):
        return (
            f"Request to {url} timed out. The API may be unreachable or slow, or a dependent backend service "
            "(such as an AI model endpoint) may not be responding. If this command supports --timeout, try "
            "increasing it."
        )
    return f"Could not complete request to {url}: {exc}"


def _transport_failure(exc: httpx.RequestError, *, reraise: bool) -> None:
    if reraise:
        raise exc
    from transformerlab_cli.state import cli_state

    detail = describe_request_error(exc)
    if cli_state.output_format == "json":
        print(json.dumps({"error": "API request failed", "detail": detail}))
    else:
        console.print(f"[error]Error:[/error] {detail}")
    raise typer.Exit(1)


def _send(
    method: str,
    path: str,
    *,
    timeout: float | None,
    follow_redirects: bool = True,
    merged_request_headers: dict | None = None,
    extra_headers: dict | None = None,
    content: bytes | str | None = None,
    data=None,
    files=None,
    json_body=None,
    reraise_transport: bool | None = None,
) -> httpx.Response:
    url = f"{BASE_URL()}{path}"
    if merged_request_headers is not None:
        headers = dict(merged_request_headers)
    else:
        headers = _request_headers()
    if extra_headers:
        headers = {**headers, **extra_headers}
    reraise = _should_reraise_transport(reraise_transport)
    try:
        with httpx.Client(timeout=timeout) as client:
            return client.request(
                method=method,
                url=url,
                headers=headers,
                follow_redirects=follow_redirects,
                content=content,
                data=data,
                files=files,
                json=json_body,
            )
    except httpx.RequestError as e:
        _transport_failure(e, reraise=reraise)


def get(
    path: str,
    timeout: float = 10.0,
    follow_redirects: bool = True,
    reraise_transport: bool | None = None,
) -> httpx.Response:
    """
    Makes a GET HTTP request to the specified URL.

    Args:
        path (str): The API path to send the request to.
        timeout (float): Request timeout in seconds. Default is 10.0.
        follow_redirects (bool): Whether to follow redirects. Default is True.
        reraise_transport: If True, connection/timeout errors propagate. If None, use
            set_reraise_transport_errors() (job monitor sets True for background workers).

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    return _send(
        "GET",
        path,
        timeout=timeout,
        follow_redirects=follow_redirects,
        reraise_transport=reraise_transport,
    )


def post(
    path: str,
    data: dict = None,
    files: dict = None,
    timeout: float = 60.0,
    reraise_transport: bool | None = None,
) -> httpx.Response:
    """
    Makes a POST HTTP request to the specified URL with the given data and files.

    Args:
        path (str): The API path to send the request to.
        data (dict, optional): The data to include in the POST request. Default is None.
        files (dict, optional): The files to include in the POST request. Default is None.
        timeout (float): Request timeout in seconds. Default is 60.0.
        reraise_transport: See get().

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    return _send(
        "POST",
        path,
        timeout=timeout,
        data=data,
        files=files,
        reraise_transport=reraise_transport,
    )


def post_json(
    path: str,
    json_data: dict = None,
    timeout: float | None = 60.0,
    reraise_transport: bool | None = None,
) -> httpx.Response:
    """
    Makes a POST HTTP request with JSON body.

    Args:
        path (str): The API path to send the request to.
        json_data (dict, optional): The JSON data to include in the POST request.
        timeout (float): Request timeout in seconds. Default is 60.0.
        reraise_transport: See get().

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    return _send("POST", path, timeout=timeout, json_body=json_data, reraise_transport=reraise_transport)


def post_text(
    path: str,
    text: str,
    timeout: float = 60.0,
    reraise_transport: bool | None = None,
) -> httpx.Response:
    """
    Makes a POST HTTP request with a plain-text body.

    Args:
        path (str): The API path to send the request to.
        text (str): The text content to include in the POST request body.
        timeout (float): Request timeout in seconds. Default is 60.0.
        reraise_transport: See get().

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    extra = {"Content-Type": "text/plain"}
    return _send(
        "POST",
        path,
        timeout=timeout,
        content=text,
        extra_headers=extra,
        reraise_transport=reraise_transport,
    )


def put(
    path: str,
    content: bytes = None,
    headers: dict = None,
    timeout: float = 300.0,
    reraise_transport: bool | None = None,
) -> httpx.Response:
    """
    Makes a PUT HTTP request with raw bytes body.

    Args:
        path (str): The API path to send the request to.
        content (bytes, optional): Raw bytes to send as the request body.
        headers (dict, optional): Additional headers to merge into the request.
        timeout (float): Request timeout in seconds. Default is 300.0.
        reraise_transport: See get().

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    merged = _request_headers()
    if headers:
        merged = {**merged, **headers}
    return _send(
        "PUT",
        path,
        timeout=timeout,
        merged_request_headers=merged,
        content=content,
        reraise_transport=reraise_transport,
    )


def put_json(
    path: str,
    json_data: dict = None,
    timeout: float = 60.0,
    reraise_transport: bool | None = None,
) -> httpx.Response:
    """
    Makes a PUT HTTP request with JSON body.

    Args:
        path (str): The API path to send the request to.
        json_data (dict, optional): The JSON data to include in the PUT request.
        timeout (float): Request timeout in seconds. Default is 60.0.
        reraise_transport: See get().

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    return _send("PUT", path, timeout=timeout, json_body=json_data, reraise_transport=reraise_transport)


def patch(
    path: str,
    json_data: dict = None,
    timeout: float = 60.0,
    reraise_transport: bool | None = None,
) -> httpx.Response:
    """
    Makes a PATCH HTTP request with JSON body.

    Args:
        path (str): The API path to send the request to.
        json_data (dict, optional): The JSON data to include in the PATCH request.
        timeout (float): Request timeout in seconds. Default is 60.0.
        reraise_transport: See get().

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    return _send("PATCH", path, timeout=timeout, json_body=json_data, reraise_transport=reraise_transport)


def delete(path: str, timeout: float = 10.0, reraise_transport: bool | None = None) -> httpx.Response:
    """
    Makes a DELETE HTTP request.

    Args:
        path (str): The API path to send the request to.
        timeout (float): Request timeout in seconds. Default is 10.0.
        reraise_transport: See get().

    Returns:
        httpx.Response: The response object from the HTTP request.
    """
    return _send("DELETE", path, timeout=timeout, reraise_transport=reraise_transport)


def check_server_status():
    """Check the status of the server."""
    try:
        response = get("/healthz")
        response.raise_for_status()
        status = response.json()
        console.print(json.dumps(status, indent=2))

    except httpx.HTTPError as e:
        console.print(f"[error]Error:[/error] Unable to connect to the server: {e}")
        raise typer.Exit(1)
