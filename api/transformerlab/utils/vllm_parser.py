import re
from typing import Optional, Tuple


def parse_vllm_tunnel_logs(logs: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse vLLM server logs to extract tunnel URL.

    Args:
        logs: Job logs as string

    Returns:
        Tuple of (tunnel_url, vllm_url) - both can be None if not found
    """
    tunnel_url = None
    vllm_url = None

    try:
        lines = logs.split("\n")

        for line in lines:
            # Parse cloudflared tunnel URL: "https://random-name.trycloudflare.com"
            if not tunnel_url:
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
                match = re.search(r"(https://[a-zA-Z0-9-]+\.(?:ngrok-free\.app|ngrok\.io))", line)
                if match:
                    tunnel_url = match.group(1)

        # vLLM URL is the same as tunnel URL (vLLM runs on port 8000, tunnel forwards to it)
        vllm_url = tunnel_url

        return tunnel_url, vllm_url

    except Exception as e:
        print(f"Error parsing vLLM tunnel logs: {e}")
        return None, None


def is_vllm_tunnel_ready(logs: str) -> bool:
    """
    Check if vLLM tunnel is ready based on logs.

    Args:
        logs: Job logs as string

    Returns:
        True if tunnel appears to be ready
    """
    try:
        tunnel_url, _ = parse_vllm_tunnel_logs(logs)

        # Tunnel is ready if we have the tunnel URL
        return tunnel_url is not None

    except Exception as e:
        print(f"Error checking vLLM tunnel readiness: {e}")
        return False


def get_vllm_tunnel_info(logs: str) -> dict:
    """
    Get complete vLLM tunnel information from logs.

    Args:
        logs: Job logs as string

    Returns:
        Dictionary with tunnel information including full vLLM URL
    """
    tunnel_url, vllm_url = parse_vllm_tunnel_logs(logs)

    # Tunnel is ready if we have the tunnel URL
    is_ready = tunnel_url is not None

    return {
        "tunnel_url": tunnel_url,
        "vllm_url": vllm_url,
        "is_ready": is_ready,
        "status": "ready" if is_ready else "loading",
    }
