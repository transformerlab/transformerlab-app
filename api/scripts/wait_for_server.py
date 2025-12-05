#!/usr/bin/env python3
"""
Wait for the Transformer Lab API server to be ready by polling the /healthz endpoint.

This script polls the server's health check endpoint until it responds successfully,
or until a timeout is reached. This is more reliable than using sleep() since server
startup time can vary.
"""

import argparse
import sys
import time
import requests


def wait_for_server(
    base_url: str = "http://127.0.0.1:8338",
    timeout: int = 120,
    interval: float = 2.0,
    endpoint: str = "/healthz",
):
    """
    Wait for the server to be ready by polling the health check endpoint.

    Args:
        base_url: Base URL of the server (default: http://127.0.0.1:8338)
        timeout: Maximum time to wait in seconds (default: 120)
        interval: Time between retry attempts in seconds (default: 2.0)
        endpoint: Health check endpoint path (default: /healthz)

    Returns:
        True if server is ready, False if timeout is reached
    """
    url = f"{base_url}{endpoint}"
    start_time = time.time()
    attempt = 0

    print(f"Waiting for server at {url} to be ready...")
    print(f"Timeout: {timeout}s, Poll interval: {interval}s")

    while True:
        elapsed = time.time() - start_time
        attempt += 1

        if elapsed >= timeout:
            print(f"\n❌ Timeout after {timeout}s. Server did not become ready.")
            return False

        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("message") == "OK":
                    elapsed_time = time.time() - start_time
                    print(f"\n✅ Server is ready! (took {elapsed_time:.1f}s, {attempt} attempts)")
                    return True
        except requests.exceptions.ConnectionError:
            # Server not yet accepting connections
            pass
        except requests.exceptions.Timeout:
            # Request timed out, but server might be starting
            pass
        except requests.exceptions.RequestException as e:
            # Other request errors
            print(f"Warning: Request error (attempt {attempt}): {e}")

        # Show progress every 10 seconds
        if attempt % max(1, int(5 / interval)) == 0:
            print(f"  Attempt {attempt}, elapsed: {elapsed:.1f}s...", end="\r")

        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="Wait for Transformer Lab API server to be ready")
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:8338",
        help="Base URL of the server (default: http://127.0.0.1:8338)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Maximum time to wait in seconds (default: 120)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Time between retry attempts in seconds (default: 2.0)",
    )
    parser.add_argument(
        "--endpoint",
        default="/healthz",
        help="Health check endpoint path (default: /healthz)",
    )

    args = parser.parse_args()

    success = wait_for_server(
        base_url=args.url,
        timeout=args.timeout,
        interval=args.interval,
        endpoint=args.endpoint,
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
