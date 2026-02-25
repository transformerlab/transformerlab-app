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
            if ("vscode.dev/tunnel" in line or "localhost:" in line) and not tunnel_url:
                # Look for the full URL
                match = re.search(r"(https://vscode\.dev/tunnel/[^\s]+)", line)
                if match:
                    tunnel_url = match.group(1)
                else:
                    # Look for local URL: "http://localhost:\d+"
                    match = re.search(r"(http://localhost:\d+)", line)
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
                # Check for ngrok: "https://abc123.ngrok-free.app" or "https://abc123.ngrok-free.dev"
                match = re.search(r"(https://[a-zA-Z0-9-]+\.(?:ngrok-free\.app|ngrok-free\.dev|ngrok\.io))", line)
                if match:
                    tunnel_url = match.group(1)

            # Check for local URL: "Local URL: http://localhost:8888"
            if not tunnel_url:
                match = re.search(r"Local URL:\s*(http://localhost:\d+)", line)
                if match:
                    tunnel_url = match.group(1)

        return token, tunnel_url

    except Exception as e:
        print(f"Error parsing Jupyter tunnel logs: {e}")
        return None, None


def parse_vllm_tunnel_logs(logs: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Parse vLLM server logs to extract tunnel URLs.

    Args:
        logs: Job logs as string

    Returns:
        Tuple of (tunnel_url, vllm_url, openwebui_url) - all can be None if not found
    """
    tunnel_url: Optional[str] = None
    vllm_url: Optional[str] = None
    openwebui_url: Optional[str] = None

    try:
        lines = logs.split("\n")

        found_urls: list[str] = []

        for line in lines:
            # Look for any HTTPS tunnel URL from supported providers
            match = re.search(
                r"(https://[a-zA-Z0-9-]+\.(?:trycloudflare\.com|ngrok-free\.app|ngrok-free\.dev|ngrok\.io))",
                line,
            )
            if match:
                url = match.group(1)
                if url not in found_urls:
                    found_urls.append(url)

            # Check for local URL patterns: "Local vLLM API: http://localhost:8000" or "Local Open WebUI: http://localhost:8080"
            match = re.search(r"Local (?:vLLM API|Open WebUI):\s*(http://localhost:\d+)", line)
            if match:
                url = match.group(1)
                if url not in found_urls:
                    found_urls.append(url)

        # Assign URLs by discovery order:
        #  - first URL: vLLM API tunnel
        #  - second URL (if present): Open WebUI tunnel
        if found_urls:
            tunnel_url = found_urls[0]
            vllm_url = tunnel_url
        if len(found_urls) > 1:
            openwebui_url = found_urls[1]

        return tunnel_url, vllm_url, openwebui_url

    except Exception as e:
        print(f"Error parsing vLLM tunnel logs: {e}")
        return None, None, None


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
                match = re.search(
                    r"url=tcp://([a-zA-Z0-9.-]+\.(?:ngrok\.io|ngrok-free\.app|ngrok-free\.dev)):(\d+)", line
                )
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
                    r"tcp://([a-zA-Z0-9.-]+\.(?:ngrok\.io|ngrok-free\.app|ngrok-free\.dev)):(\d+)\s*->\s*localhost:22",
                    line,
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
    # Since Jupyter is started without token requirement, use tunnel URL directly
    jupyter_url = tunnel_url

    # If token exists, append it to the URL (though we don't require it)
    if jupyter_url and token:
        separator = "&" if "?" in jupyter_url else "?"
        jupyter_url = f"{jupyter_url}{separator}token={token}"

    # Tunnel is ready if we have the tunnel URL (token is optional)
    is_ready = tunnel_url is not None

    return {
        "token": token,
        "tunnel_url": tunnel_url,
        "jupyter_url": jupyter_url,
        "is_ready": is_ready,
        "status": "ready" if is_ready else "loading",
    }


def get_vllm_tunnel_info(logs: str) -> dict:
    """
    Get complete vLLM tunnel information from logs.

    Args:
        logs: Job logs as string

    Returns:
        Dictionary with tunnel information including full vLLM and Open WebUI URLs
    """
    tunnel_url, vllm_url, openwebui_url = parse_vllm_tunnel_logs(logs)

    # Tunnel is ready if we have the primary tunnel URL
    is_ready = tunnel_url is not None

    return {
        "tunnel_url": tunnel_url,
        "vllm_url": vllm_url,
        "openwebui_url": openwebui_url,
        "is_ready": is_ready,
        "status": "ready" if is_ready else "loading",
    }


def parse_ollama_tunnel_logs(logs: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Parse Ollama server logs to extract tunnel URL.

    Args:
        logs: Job logs as string

    Returns:
        Tuple of (tunnel_url, ollama_url, openwebui_url) - all can be None if not found
    """
    tunnel_url: Optional[str] = None
    ollama_url: Optional[str] = None
    openwebui_url: Optional[str] = None

    try:
        lines = logs.split("\n")

        found_urls: list[str] = []

        for line in lines:
            # Look for any HTTPS tunnel URL from supported providers
            match = re.search(
                r"(https://[a-zA-Z0-9-]+\.(?:trycloudflare\.com|ngrok-free\.app|ngrok-free\.dev|ngrok\.io))",
                line,
            )
            if match:
                url = match.group(1)
                if url not in found_urls:
                    found_urls.append(url)

            # Check for local URL patterns: "Local Ollama API: http://localhost:11434" or "Local Open WebUI: http://localhost:8080"
            match = re.search(r"Local (?:Ollama API|Open WebUI):\s*(http://localhost:\d+)", line)
            if match:
                url = match.group(1)
                if url not in found_urls:
                    found_urls.append(url)

        # Assign URLs by discovery order:
        #  - first URL: Ollama API tunnel
        #  - second URL (if present): Open WebUI tunnel
        if found_urls:
            tunnel_url = found_urls[0]
            ollama_url = tunnel_url
        if len(found_urls) > 1:
            openwebui_url = found_urls[1]

        return tunnel_url, ollama_url, openwebui_url

    except Exception as e:
        print(f"Error parsing Ollama tunnel logs: {e}")
        return None, None, None


def get_ollama_tunnel_info(logs: str) -> dict:
    """
    Get complete Ollama tunnel information from logs.

    Args:
        logs: Job logs as string

    Returns:
        Dictionary with tunnel information including full Ollama and Open WebUI URLs
    """
    tunnel_url, ollama_url, openwebui_url = parse_ollama_tunnel_logs(logs)

    # Tunnel is ready if we have the tunnel URL
    is_ready = tunnel_url is not None

    return {
        "tunnel_url": tunnel_url,
        "ollama_url": ollama_url,
        "openwebui_url": openwebui_url,
        "is_ready": is_ready,
        "status": "ready" if is_ready else "loading",
    }


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


def get_tunnel_info(logs: str, interactive_type: str) -> dict:
    """
    Get tunnel information based on the interactive type.

    Args:
        logs: Job logs as string
        interactive_type: Type of interactive task ('vscode', 'jupyter', 'vllm', 'ollama', 'ssh')

    Returns:
        Dictionary with tunnel information specific to the interactive type
    """
    if interactive_type == "vscode":
        return get_vscode_tunnel_info(logs)
    elif interactive_type == "jupyter":
        return get_jupyter_tunnel_info(logs)
    elif interactive_type == "vllm":
        return get_vllm_tunnel_info(logs)
    elif interactive_type == "ollama":
        return get_ollama_tunnel_info(logs)
    elif interactive_type == "ssh":
        return get_ssh_tunnel_info(logs)
    else:
        return {
            "error": f"Unknown interactive type: {interactive_type}",
            "is_ready": False,
            "status": "error",
        }
