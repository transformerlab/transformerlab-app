import re
from typing import Optional, Tuple


def parse_vscode_tunnel_logs(logs: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse VSCode tunnel logs to extract auth code and tunnel URL.

    Args:
        logs: Job logs as string

    Returns:
        Tuple of (auth_code, tunnel_url) - both can be None if not found
    """
    auth_code = None
    tunnel_url = None

    try:
        lines = logs.split("\n")

        for line in lines:
            # Parse auth code: "use code 9669-7DED"
            if "use code" in line and not auth_code:
                match = re.search(r"use code (\w+-\w+)", line)
                if match:
                    auth_code = match.group(1)

            # Parse tunnel URL: "https://vscode.dev/tunnel/maclan/..."
            if "vscode.dev/tunnel" in line and not tunnel_url:
                # Look for the full URL
                match = re.search(r"(https://vscode\.dev/tunnel/[^\s]+)", line)
                if match:
                    tunnel_url = match.group(1)
                else:
                    # If no full URL, look for just the tunnel path
                    match = re.search(r"(vscode\.dev/tunnel/[^\s]+)", line)
                    if match:
                        tunnel_url = f"https://{match.group(1)}"

        return auth_code, tunnel_url

    except Exception as e:
        print(f"Error parsing VSCode tunnel logs: {e}")
        return None, None


def is_vscode_tunnel_ready(logs: str) -> bool:
    """
    Check if VSCode tunnel is ready based on logs.

    Args:
        logs: Job logs as string

    Returns:
        True if tunnel appears to be ready
    """
    try:
        # Check for tunnel URL presence
        auth_code, tunnel_url = parse_vscode_tunnel_logs(logs)

        # Tunnel is ready if we have both auth code and tunnel URL
        return auth_code is not None and tunnel_url is not None

    except Exception as e:
        print(f"Error checking VSCode tunnel readiness: {e}")
        return False


def get_vscode_tunnel_info(logs: str) -> dict:
    """
    Get complete VSCode tunnel information from logs.

    Args:
        logs: Job logs as string

    Returns:
        Dictionary with tunnel information
    """
    auth_code, tunnel_url = parse_vscode_tunnel_logs(logs)

    return {
        "auth_code": auth_code,
        "tunnel_url": tunnel_url,
        "is_ready": auth_code is not None and tunnel_url is not None,
        "status": "ready" if (auth_code is not None and tunnel_url is not None) else "loading",
    }
