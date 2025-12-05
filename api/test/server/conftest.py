import pytest
import time
import requests


def wait_for_server_ready(base_url: str, timeout: int = 120, interval: float = 2.0):
    """
    Wait for the server to be ready by polling the /healthz endpoint.

    Args:
        base_url: Base URL of the server
        timeout: Maximum time to wait in seconds
        interval: Time between retry attempts in seconds

    Raises:
        Exception: If server doesn't become ready within timeout
    """
    healthz_url = f"{base_url}/healthz"
    start_time = time.time()
    attempt = 0

    while True:
        elapsed = time.time() - start_time

        if elapsed >= timeout:
            raise Exception(f"Server at {base_url} did not become ready within {timeout}s. Last attempt: {attempt}")

        try:
            response = requests.get(healthz_url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("message") == "OK":
                    return  # Server is ready
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            # Server not yet accepting connections, continue retrying
            pass
        except requests.exceptions.RequestException:
            # Other request errors, continue retrying
            pass

        attempt += 1
        time.sleep(interval)


@pytest.fixture(scope="session")
def live_server():
    """
    Fixture that provides the base URL of a running server.

    The server is expected to be started externally (e.g., by CI/CD workflow).
    This fixture waits for the server to be ready before yielding the URL.
    """
    host = "127.0.0.1"
    port = 8338  # For testing, we can use a fixed port
    base_url = f"http://{host}:{port}"

    # Wait for the server to be ready
    wait_for_server_ready(base_url, timeout=120, interval=2.0)

    yield base_url

    # Teardown - server is managed externally, so nothing to clean up here
