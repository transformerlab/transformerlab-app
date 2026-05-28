import re
from typing import Optional, Tuple

PUBLIC_TUNNEL_URL_PATTERN = r"https://[a-zA-Z0-9-]+\.(?:trycloudflare\.com|ngrok-free\.app|ngrok-free\.dev|ngrok\.io)"


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
                match = re.search(r"[?&]token=([A-Za-z0-9._-]{8,})", line)
                if match:
                    token = match.group(1)
                else:
                    # Also try to find standalone token mentions
                    match = re.search(r"token[=:]\s*([A-Za-z0-9._-]{8,})", line, re.IGNORECASE)
                    if match:
                        token = match.group(1)

            # Parse public tunnel URL
            if not tunnel_url:
                match = re.search(f"({PUBLIC_TUNNEL_URL_PATTERN})", line)
                if match:
                    tunnel_url = match.group(1)

            # Parse local Jupyter URL from server startup output if no public URL was found
            if not tunnel_url:
                match = re.search(r"(https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):8888[^\s]*)", line)
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
            match = re.search(f"({PUBLIC_TUNNEL_URL_PATTERN})", line)
            if match:
                url = match.group(1)
                if url not in found_urls:
                    found_urls.append(url)

            # Parse local URLs emitted by startup scripts/servers.
            match = re.search(r"(https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(8000|8080)[^\s]*)", line)
            if match:
                full_url = match.group(1)
                port = match.group(2)
                if port == "8000":
                    vllm_url = full_url
                elif port == "8080":
                    openwebui_url = full_url

        # Prefer explicit local port-derived URLs when available.
        if vllm_url or openwebui_url:
            tunnel_url = vllm_url or openwebui_url
        # Otherwise, assign public URLs by discovery order.
        elif found_urls:
            tunnel_url = found_urls[0]
            vllm_url = found_urls[0]
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

    # If token exists, append it to the URL unless it is already present.
    if jupyter_url and token and "token=" not in jupyter_url:
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
            match = re.search(f"({PUBLIC_TUNNEL_URL_PATTERN})", line)
            if match:
                url = match.group(1)
                if url not in found_urls:
                    found_urls.append(url)

            # Parse local URLs emitted by startup scripts/servers.
            match = re.search(r"(https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(11434|8080)[^\s]*)", line)
            if match:
                full_url = match.group(1)
                port = match.group(2)
                if port == "11434":
                    ollama_url = full_url
                elif port == "8080":
                    openwebui_url = full_url

        # Prefer explicit local port-derived URLs when available.
        if ollama_url or openwebui_url:
            tunnel_url = ollama_url or openwebui_url
        # Otherwise, assign public URLs by discovery order.
        elif found_urls:
            tunnel_url = found_urls[0]
            ollama_url = found_urls[0]
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


def get_custom_tunnel_info(logs: str, url_patterns: list[dict] | None) -> dict:
    """
    Generic log parser driven by caller-supplied regex patterns.

    Each entry in *url_patterns* is a dict with:
      - value_key (str): key name returned in the result dict
      - regex (str): Python regex applied to the full log text
      - group (int, optional): capture-group index to extract (default 0)

    Returns a dict with each value_key mapped to the extracted string (or None),
    plus ``is_ready`` / ``status`` for the standard tunnel-info contract.
    """
    values: dict = {}
    found_any = False
    ngrok_match = re.search(r"(https://[a-zA-Z0-9-]+\.(?:ngrok-free\.app|ngrok-free\.dev|ngrok\.io))", logs)
    preferred_ngrok_url = ngrok_match.group(1) if ngrok_match else None

    for pattern_def in url_patterns or []:
        value_key = pattern_def.get("value_key")
        regex = pattern_def.get("regex")
        group = pattern_def.get("group", 0)

        if not value_key or not regex:
            continue

        # Prefer a discovered ngrok public URL for URL-like keys.
        # This avoids selecting local URLs (e.g. 0.0.0.0 / localhost) when both are present.
        if preferred_ngrok_url and isinstance(value_key, str) and value_key.endswith("_url"):
            values[value_key] = preferred_ngrok_url
            found_any = True
            continue

        try:
            match = re.search(regex, logs, re.MULTILINE)
        except re.error as e:
            print(f"Invalid custom url_pattern regex for {value_key}: {e}")
            values[value_key] = None
            continue

        value = None
        if match:
            try:
                value = match.group(group)
            except IndexError:
                print(f"Invalid group {group} for custom url_pattern {value_key}")

        values[value_key] = value
        if value is not None:
            found_any = True

    return {
        **values,
        "is_ready": found_any,
        "status": "ready" if found_any else "loading",
    }


def get_tunnel_info(logs: str, interactive_type: str | None, url_patterns: list[dict] | None = None) -> dict:
    """
    Get tunnel information based on the interactive type.

    Args:
        logs: Job logs as string
        interactive_type: Type of interactive task ('vscode', 'jupyter', 'vllm', 'ollama', 'ssh', or None/'custom' for pattern-based)
        url_patterns: Optional list of pattern dicts for custom parsing

    Returns:
        Dictionary with tunnel information specific to the interactive type
    """
    if not interactive_type or interactive_type == "custom":
        return get_custom_tunnel_info(logs, url_patterns)

    # If gallery-supplied custom patterns exist for a known interactive type,
    # prefer them first. This lets templates parse exact emitted log lines
    # without changing built-in parser behavior for older entries.
    if url_patterns:
        custom_info = get_custom_tunnel_info(logs, url_patterns)
        if custom_info.get("is_ready"):
            return custom_info

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
        # Unknown interactive_type: fall back to custom pattern-based parsing
        # if url_patterns are available (e.g. ollama_gradio).
        if url_patterns:
            return get_custom_tunnel_info(logs, url_patterns)
        return {
            "error": f"Unknown interactive type: {interactive_type}",
            "is_ready": False,
            "status": "error",
        }
