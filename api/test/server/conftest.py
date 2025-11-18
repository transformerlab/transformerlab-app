import pytest


@pytest.fixture(scope="session")
def live_server():
    # Get a free port
    # import socket

    # s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # s.bind(("127.0.0.1", 0))
    # port = s.getsockname()[1]
    # s.close()

    # # Start the server process
    # print("about to run: ./run.sh -p", port)
    host = "127.0.0.1"
    port = 8338  # For testing, we can use a fixed port
    # server_process = subprocess.Popen(["./run.sh", "-h", host, "-p", str(port)])

    # # Give it time to start
    # time.sleep(20)

    base_url = f"http://{host}:{port}"

    # Verify the server is running
    import requests

    try:
        response = requests.get(f"{base_url}/")
        assert response.status_code == 200
    except Exception as e:
        # server_process.terminate()
        raise Exception(f"Failed to start server: {e}")

    yield base_url

    # Teardown - stop the server
    # server_process.terminate()
    # server_process.wait()
