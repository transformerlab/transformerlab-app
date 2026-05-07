"""One-shot loopback HTTP server for browser-based CLI login.

Flow:
  1. Generate a random state token.
  2. Bind a ThreadingHTTPServer on 127.0.0.1 to a free port.
  3. Open the browser to <server>/#/cli-auth?state=...&redirect=http://127.0.0.1:<port>/.
  4. The web app authorizes, calls POST /auth/api-keys, and navigates the browser to
     http://127.0.0.1:<port>/#key=...&state=...&team_id=...&team_name=....
  5. GET / on the loopback server returns a tiny HTML+JS page that reads
     window.location.hash and POSTs the parsed fragment as JSON to /callback.
  6. POST /callback validates state matches, signals the main thread, returns 204.
  7. The CLI returns {api_key, team_id, team_name} to its caller.
"""

from __future__ import annotations

import json
import secrets
import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

from transformerlab_cli.util.ui import console


class BrowserLoginError(Exception):
    """Raised when the browser-based login flow fails."""


_SUCCESS_HTML = b"""<!doctype html>
<html><head><meta charset="utf-8"><title>Lab CLI authorized</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 16px;color:#222}
.ok{color:#0a7d2c}.err{color:#b00020}</style></head>
<body>
<h2 id="title">Finishing login\xe2\x80\xa6</h2>
<p id="msg">Talking to the Lab CLI on this machine.</p>
<script>
(async function () {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const payload = {
    state: params.get("state"),
    key: params.get("key"),
    team_id: params.get("team_id"),
    team_name: params.get("team_name"),
  };
  try {
    const r = await fetch("/callback", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      document.getElementById("title").textContent = "You're logged in";
      document.getElementById("title").className = "ok";
      document.getElementById("msg").textContent = "You can close this tab and return to your terminal.";
    } else {
      document.getElementById("title").textContent = "Login failed";
      document.getElementById("title").className = "err";
      document.getElementById("msg").textContent = "The CLI rejected the callback (state mismatch).";
    }
  } catch (e) {
    document.getElementById("title").textContent = "Login failed";
    document.getElementById("title").className = "err";
    document.getElementById("msg").textContent = "Could not reach the local CLI server.";
  }
})();
</script>
</body></html>
"""


def _find_free_port(attempts: int = 5) -> int:
    """Return a free loopback port, trying up to `attempts` times."""
    for _ in range(attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]
    raise BrowserLoginError("Could not find a free local port for the login server.")


def _build_handler(expected_state: str, result: dict, done: threading.Event):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):  # silence default stderr logging
            return

        def do_GET(self):
            if self.path == "/" or self.path.startswith("/#"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(_SUCCESS_HTML)))
                self.end_headers()
                self.wfile.write(_SUCCESS_HTML)
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self):
            if self.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return

            length = int(self.headers.get("Content-Length", "0"))
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                self.send_response(400)
                self.end_headers()
                return

            if body.get("state") != expected_state or not body.get("key"):
                self.send_response(400)
                self.end_headers()
                return

            result["api_key"] = body["key"]
            result["team_id"] = body.get("team_id")
            result["team_name"] = body.get("team_name")
            self.send_response(204)
            self.end_headers()
            done.set()

    return Handler


def run_browser_login(
    server_url: str,
    open_browser: bool = True,
    timeout: int = 300,
) -> dict:
    """Run the browser-based login handshake.

    Returns a dict with keys: api_key, team_id, team_name.
    Raises BrowserLoginError on timeout, server failure, or KeyboardInterrupt.
    """
    state = secrets.token_urlsafe(32)
    port = _find_free_port()
    redirect = f"http://127.0.0.1:{port}/"
    authorize_url = f"{server_url.rstrip('/')}/#/cli-auth?state={quote(state)}&redirect={quote(redirect, safe='')}"

    result: dict = {}
    done = threading.Event()
    server = ThreadingHTTPServer(("127.0.0.1", port), _build_handler(state, result, done))
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        if open_browser:
            opened = False
            try:
                opened = webbrowser.open(authorize_url)
            except webbrowser.Error:
                opened = False
            if not opened:
                console.print("[warning]Could not open a browser. Open this URL manually:[/warning]")
                console.print(f"[bold]{authorize_url}[/bold]")
        else:
            console.print("[label]Open this URL in your browser:[/label]")
            console.print(f"[bold]{authorize_url}[/bold]")

        if not done.wait(timeout=timeout):
            raise BrowserLoginError("Login timed out waiting for browser callback.")

        return {
            "api_key": result["api_key"],
            "team_id": result.get("team_id"),
            "team_name": result.get("team_name"),
        }
    except KeyboardInterrupt:
        raise BrowserLoginError("Login cancelled.")
    finally:
        server.shutdown()
        server.server_close()
