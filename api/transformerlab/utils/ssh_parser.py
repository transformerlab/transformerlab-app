import re
from typing import Optional, Tuple


def parse_ssh_tunnel_logs(logs: str) -> Tuple[Optional[str], Optional[int], Optional[str]]:
    """
    Parse ngrok SSH tunnel logs to extract domain, port, and username.

    Args:
        logs: Job logs as string

    Returns:
        Tuple of (domain, port, username) - all can be None if not found
    """
    domain = None
    port = None
    username = None

    try:
        lines = logs.split("\n")

        for line in lines:
            # Parse ngrok tunnel URL from log output: "url=tcp://6.tcp.ngrok.io:10808"
            # This appears in lines like: lvl=info msg="started tunnel" ... url=tcp://6.tcp.ngrok.io:10808
            if "url=tcp://" in line and not domain:
                # Look for pattern: url=tcp://<domain>:<port>
                match = re.search(r"url=tcp://([a-zA-Z0-9.-]+\.ngrok\.io|ngrok-free\.app|ngrok\.io):(\d+)", line)
                if match:
                    domain = match.group(1)
                    try:
                        port = int(match.group(2))
                    except (ValueError, TypeError):
                        pass

            # Also check for the old format: "Forwarding                    tcp://8.tcp.ngrok.io:12904 -> localhost:22"
            if "Forwarding" in line and "tcp://" in line and not domain:
                # Look for pattern: tcp://<domain>:<port> -> localhost:22
                match = re.search(
                    r"tcp://([a-zA-Z0-9.-]+\.ngrok\.io|ngrok-free\.app|ngrok\.io):(\d+)\s*->\s*localhost:22", line
                )
                if match:
                    domain = match.group(1)
                    try:
                        port = int(match.group(2))
                    except (ValueError, TypeError):
                        pass

            # Parse username from echo USER_ID=$USER output
            # Look for pattern: USER_ID=<username>
            if not username:
                match = re.search(r"USER_ID=([a-zA-Z0-9_-]+)", line)
                if match and match.group(1):  # Make sure we got a non-empty value
                    username = match.group(1)

            # Fallback: Parse username from paths like /home/<username>/.config/ngrok/ngrok.yml
            if not username:
                # Look for /home/<username>/ patterns
                match = re.search(r"/home/([a-zA-Z0-9_-]+)/", line)
                if match:
                    potential_username = match.group(1)
                    # Make sure it's not a common system path
                    if potential_username not in ["root", "nobody", "daemon"]:
                        username = potential_username

        return domain, port, username

    except Exception as e:
        print(f"Error parsing SSH tunnel logs: {e}")
        return None, None, None


def is_ssh_tunnel_ready(logs: str) -> bool:
    """
    Check if SSH tunnel is ready based on logs.

    Args:
        logs: Job logs as string

    Returns:
        True if tunnel appears to be ready
    """
    try:
        domain, port, username = parse_ssh_tunnel_logs(logs)

        # Tunnel is ready if we have domain and port (username is helpful but not required)
        return domain is not None and port is not None

    except Exception as e:
        print(f"Error checking SSH tunnel readiness: {e}")
        return False


def get_ssh_tunnel_info(logs: str) -> dict:
    """
    Get complete SSH tunnel information from logs.

    Args:
        logs: Job logs as string

    Returns:
        Dictionary with tunnel information including SSH command
    """
    domain, port, username = parse_ssh_tunnel_logs(logs)

    # Tunnel is ready if we have domain and port
    is_ready = domain is not None and port is not None

    # Construct SSH command
    ssh_command = None
    if domain and port:
        if username:
            ssh_command = f"ssh -p {port} {username}@{domain}"
        else:
            ssh_command = f"ssh -p {port} <username>@{domain}"

    return {
        "domain": domain,
        "port": port,
        "username": username,
        "ssh_command": ssh_command,
        "is_ready": is_ready,
        "status": "ready" if is_ready else "loading",
    }
