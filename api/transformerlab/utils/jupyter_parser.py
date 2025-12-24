import re
from typing import Optional, Tuple


def parse_jupyter_tunnel_logs(logs: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse Jupyter notebook logs to extract token and tunnel URL.

    Args:
        logs: Job logs as string

    Returns:
        Tuple of (token, tunnel_url) - both can be None if not found
    """
    token = None
    tunnel_url = None

    try:
        lines = logs.split("\n")

        for line in lines:
            # Parse Jupyter token from startup logs
            # Jupyter prints: "http://localhost:8888/?token=abc123..." or "?token=abc123..."
            if "token=" in line and not token:
                # Look for token in URLs
                match = re.search(r"[?&]token=([a-f0-9]{32,})", line)
                if match:
                    token = match.group(1)
                else:
                    # Also try to find standalone token mentions
                    match = re.search(r"token[=:]\s*([a-f0-9]{32,})", line, re.IGNORECASE)
                    if match:
                        token = match.group(1)

            # Parse cloudflared tunnel URL: "https://random-name.trycloudflare.com"
            if "trycloudflare.com" in line and not tunnel_url:
                # Look for the full URL
                match = re.search(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)", line)
                if match:
                    tunnel_url = match.group(1)
                else:
                    # If no full URL, look for just the domain
                    match = re.search(r"([a-zA-Z0-9-]+\.trycloudflare\.com)", line)
                    if match:
                        tunnel_url = f"https://{match.group(1)}"

            # Also check for other tunnel services (ngrok, localtunnel, etc.)
            if not tunnel_url:
                # Check for ngrok: "https://abc123.ngrok-free.app"
                if "ngrok-free.app" in line or "ngrok.io" in line:
                    match = re.search(r"(https://[a-zA-Z0-9-]+\.(?:ngrok-free\.app|ngrok\.io))", line)
                    if match:
                        tunnel_url = match.group(1)

        return token, tunnel_url

    except Exception as e:
        print(f"Error parsing Jupyter tunnel logs: {e}")
        return None, None


def is_jupyter_tunnel_ready(logs: str) -> bool:
    """
    Check if Jupyter tunnel is ready based on logs.

    Args:
        logs: Job logs as string

    Returns:
        True if tunnel appears to be ready
    """
    try:
        token, tunnel_url = parse_jupyter_tunnel_logs(logs)

        # Tunnel is ready if we have the tunnel URL (token is optional)
        return tunnel_url is not None

    except Exception as e:
        print(f"Error checking Jupyter tunnel readiness: {e}")
        return False


def get_jupyter_tunnel_info(logs: str) -> dict:
    """
    Get complete Jupyter tunnel information from logs.

    Args:
        logs: Job logs as string

    Returns:
        Dictionary with tunnel information including full Jupyter URL
    """
    token, tunnel_url = parse_jupyter_tunnel_logs(logs)

    # Construct the full Jupyter URL
    # If no token, use tunnel URL directly (Jupyter started without token requirement)
    jupyter_url = None
    if tunnel_url:
        if token:
            # Combine tunnel URL with token parameter if token exists
            separator = "&" if "?" in tunnel_url else "?"
            jupyter_url = f"{tunnel_url}{separator}token={token}"
        else:
            # No token needed - Jupyter started without token requirement
            jupyter_url = tunnel_url

    # Tunnel is ready if we have the tunnel URL (token is optional)
    is_ready = tunnel_url is not None

    return {
        "token": token,
        "tunnel_url": tunnel_url,
        "jupyter_url": jupyter_url,
        "is_ready": is_ready,
        "status": "ready" if is_ready else "loading",
    }
