# NOTE: Uses the synchronous `client` fixture from api/test/api/conftest.py.
# The fixture provides an AuthenticatedTestClient (sync TestClient) that automatically
# adds Bearer token + X-Team-Id headers. That's OK — the public route does not require
# auth, so the extra headers are simply ignored by the route handler.
# For a truly unauthenticated assertion you'd need a separate raw client; that's
# deferred to the E2E test.

import time

# Public endpoints intentionally accept unauthenticated requests, but the existing
# `client` fixture injects auth headers. That's OK — the route does not require auth,
# so the headers are simply ignored. For a truly unauthenticated assertion you'd need
# a separate raw client; that's deferred to the E2E test.


def _mint_notes_link(client) -> tuple[str, str]:
    """Create an experiment, mint a notes share link, return (token, experiment_id)."""
    name = f"share_pub_{int(time.time() * 1000)}"
    r = client.get(f"/experiment/create?name={name}")
    assert r.status_code == 200
    experiment_id = r.json()
    r = client.post(f"/experiment/{experiment_id}/share/notes")
    assert r.status_code == 200
    return r.json()["token"], str(experiment_id)


def _mint_chart_link(client) -> tuple[str, str]:
    name = f"share_pub_chart_{int(time.time() * 1000)}"
    r = client.get(f"/experiment/create?name={name}")
    assert r.status_code == 200
    experiment_id = r.json()
    r = client.post(f"/experiment/{experiment_id}/share/chart")
    assert r.status_code == 200
    return r.json()["token"], str(experiment_id)


def test_unknown_token_returns_404(client):
    r = client.get("/public/share/this-token-does-not-exist")
    assert r.status_code == 404


def test_notes_token_returns_payload(client):
    token, _ = _mint_notes_link(client)
    r = client.get(f"/public/share/{token}")
    assert r.status_code == 200
    body = r.json()
    assert body["resource_type"] == "experiment_notes"
    assert isinstance(body["payload"]["markdown"], str)


def test_chart_token_returns_payload(client):
    token, _ = _mint_chart_link(client)
    r = client.get(f"/public/share/{token}")
    assert r.status_code == 200
    body = r.json()
    assert body["resource_type"] == "experiment_chart"
    assert isinstance(body["payload"]["jobs"], list)


def test_revoked_token_returns_404(client):
    token, experiment_id = _mint_notes_link(client)
    client.delete(f"/experiment/{experiment_id}/share/notes")
    r = client.get(f"/public/share/{token}")
    assert r.status_code == 404


def test_asset_endpoint_rejects_chart_token(client):
    token, _ = _mint_chart_link(client)
    r = client.get(f"/public/share/{token}/asset/foo.png")
    assert r.status_code == 404


def test_asset_endpoint_rejects_disallowed_extension(client):
    token, _ = _mint_notes_link(client)
    r = client.get(f"/public/share/{token}/asset/payload.sh")
    assert r.status_code in (400, 404)


def test_payload_rewrites_asset_paths(client):
    # We can't easily seed a real markdown file with an image without filesystem setup.
    # Instead, unit-test the regex helper directly.
    from transformerlab.routers.public_share import _rewrite_asset_paths

    out = _rewrite_asset_paths("![alt](notes/assets/foo.png)", "TOK123")
    assert "notes/assets/foo.png" not in out
    assert "/public/share/TOK123/asset/foo.png" in out


# ---------------------------------------------------------------------------
# Structural team-isolation tests
# ---------------------------------------------------------------------------
# The harness in api/test/api/conftest.py supports only one admin user / team.
# Cross-team isolation is therefore asserted structurally:
#   1. Public router has no auth dependency wired in.
#   2. Tokens carry >= 256 bits of entropy and are unguessable.
#   3. The public router module imports no team-filtering helpers.


def test_public_router_has_no_auth_dependency():
    from transformerlab.routers import public_share

    routes = [r for r in public_share.router.routes]
    assert routes, "public_share.router has no routes"
    for route in routes:
        for dep in getattr(route, "dependencies", []) or []:
            # If any auth-related dep is wired in, the isolation guarantee weakens.
            name = getattr(getattr(dep, "dependency", None), "__name__", "") or ""
            assert "user" not in name.lower(), f"unexpected auth dep on public route: {name}"
            assert "team" not in name.lower(), f"unexpected team dep on public route: {name}"


def test_public_router_module_does_not_import_auth_helpers():
    # Read the source file rather than the imported symbols so we catch
    # accidental re-imports added by future edits.
    import pathlib

    src = (
        pathlib.Path("transformerlab/routers/public_share.py").read_text()
        if pathlib.Path("transformerlab/routers/public_share.py").exists()
        else pathlib.Path("api/transformerlab/routers/public_share.py").read_text()
    )
    assert "get_user_and_team" not in src
    assert "require_permission" not in src


def test_token_has_sufficient_entropy():
    # The service mints tokens with secrets.token_urlsafe(32), which produces
    # ~43 chars and 256 bits of entropy. Verify the function used is unchanged.
    import inspect

    from transformerlab.services import share_link_service

    src = inspect.getsource(share_link_service._generate_token)
    assert "token_urlsafe(32)" in src, "Token generation entropy has been weakened"


def test_resolve_token_does_not_filter_by_team():
    # Read the service source and confirm resolve_token's filter only checks
    # token + revoked_at — no team_id filter (which would defeat anonymous access).
    import inspect

    from transformerlab.services import share_link_service

    src = inspect.getsource(share_link_service.resolve_token)
    assert "team_id" not in src, "resolve_token must not filter by team_id"
    assert "PublicShareLink.token" in src
    assert "revoked_at" in src
