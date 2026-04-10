"""Live API smoke tests for API routes touched by the CLI.

These tests run against a real server and validate route contracts that CLI commands rely on.
They are skipped by default unless TLAB_RUN_LIVE_SERVER_TESTS=1 is set.
"""

import os
import time
import uuid

import httpx
import pytest


RUN_LIVE_TESTS = os.getenv("TLAB_RUN_LIVE_SERVER_TESTS") == "1"
BASE_URL = os.getenv("TLAB_LIVE_SERVER_URL", "http://127.0.0.1:8338").rstrip("/")
LOGIN_EMAIL = os.getenv("TLAB_LIVE_TEST_EMAIL", "admin@example.com")
LOGIN_PASSWORD = os.getenv("TLAB_LIVE_TEST_PASSWORD", "admin123")


pytestmark = pytest.mark.skipif(not RUN_LIVE_TESTS, reason="Set TLAB_RUN_LIVE_SERVER_TESTS=1 to run live tests")


def _auth_headers(client: httpx.Client) -> dict[str, str]:
    login_response = client.post(
        f"{BASE_URL}/auth/jwt/login",
        data={"username": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login_response.status_code == 200, login_response.text

    token = login_response.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    teams_response = client.get(f"{BASE_URL}/users/me/teams", headers=auth_headers)
    assert teams_response.status_code == 200, teams_response.text

    teams_payload = teams_response.json()
    teams_list: list[dict]
    if isinstance(teams_payload, list):
        teams_list = teams_payload
    elif isinstance(teams_payload, dict):
        if isinstance(teams_payload.get("teams"), list):
            teams_list = teams_payload["teams"]
        elif isinstance(teams_payload.get("data"), list):
            teams_list = teams_payload["data"]
        else:
            teams_list = []
    else:
        teams_list = []

    assert teams_list, f"Expected at least one team for the test user, got: {teams_payload!r}"
    return {**auth_headers, "X-Team-Id": str(teams_list[0]["id"])}


def _first_experiment_id(client: httpx.Client, headers: dict[str, str]) -> str:
    experiments_response = client.get(f"{BASE_URL}/experiment/", headers=headers)
    assert experiments_response.status_code == 200, experiments_response.text

    payload = experiments_response.json()
    if isinstance(payload, list) and payload:
        first = payload[0]
        if isinstance(first, dict):
            experiment_id = first.get("id")
            assert experiment_id, f"Experiment object missing id: {first!r}"
            return str(experiment_id)
        return str(first)
    if isinstance(payload, dict):
        for key in ("experiments", "data"):
            value = payload.get(key)
            if isinstance(value, list) and value:
                first = value[0]
                if isinstance(first, dict):
                    experiment_id = first.get("id")
                    assert experiment_id, f"Experiment object missing id: {first!r}"
                    return str(experiment_id)
                return str(first)
    raise AssertionError(f"Expected at least one experiment, got: {payload!r}")


def _assert_status_in(response: httpx.Response, expected: set[int], route_name: str) -> None:
    assert response.status_code in expected, (
        f"{route_name} returned unexpected status {response.status_code}. "
        f"Expected one of {sorted(expected)}. Body: {response.text}"
    )


def _assert_json_message(response: httpx.Response, accepted_messages: set[str], route_name: str) -> None:
    try:
        payload = response.json()
    except ValueError as exc:
        raise AssertionError(f"{route_name} expected JSON body for 200 response. Body: {response.text}") from exc
    message = str(payload.get("message", payload.get("detail", ""))).strip().lower()
    assert message in accepted_messages, (
        f"{route_name} returned 200 with unexpected JSON message '{message}'. Body: {response.text}"
    )


def _assert_missing_contract(response: httpx.Response, route_name: str) -> None:
    """Accept 404 or legacy 200 JSON with missing-resource message."""
    if response.status_code == 404:
        return
    if response.status_code == 200:
        _assert_json_message(response, {"not found"}, route_name)
        return
    raise AssertionError(
        f"{route_name} returned unexpected status {response.status_code}. "
        f"Expected 404 or legacy 200/NOT FOUND. Body: {response.text}"
    )


def _assert_stop_contract(response: httpx.Response, route_name: str) -> None:
    """Accept backend stop-job variants for missing/non-running jobs."""
    if response.status_code == 404:
        return
    if response.status_code == 200:
        _assert_json_message(response, {"ok", "not found"}, route_name)
        return
    raise AssertionError(
        f"{route_name} returned unexpected status {response.status_code}. "
        f"Expected 404 or legacy 200/OK|NOT FOUND. Body: {response.text}"
    )


def _assert_stream_or_logs_missing_contract(response: httpx.Response, route_name: str) -> None:
    """Accept missing-job behavior for log/stream endpoints.

    Some backends return 404, while others return 200 with plain text payloads
    like 'data: Error: ...' for missing jobs.
    """
    if response.status_code == 404:
        return
    if response.status_code == 200:
        content = response.text.lower()
        assert any(token in content for token in ("error", "not found", "no log files found")), (
            f"{route_name} returned 200 without a recognizable missing/error payload. Body: {response.text}"
        )
        return
    raise AssertionError(
        f"{route_name} returned unexpected status {response.status_code}. "
        f"Expected 404 or legacy 200/error text. Body: {response.text}"
    )


def _get_with_retry(
    client: httpx.Client,
    url: str,
    headers: dict[str, str],
    attempts: int = 3,
    delay_seconds: float = 0.5,
) -> httpx.Response:
    """Retry GET briefly for routes that may become consistent asynchronously."""
    response = client.get(url, headers=headers)
    for _ in range(attempts - 1):
        if response.status_code != 404:
            break
        time.sleep(delay_seconds)
        response = client.get(url, headers=headers)
    return response


@pytest.fixture()
def live_context() -> dict[str, str]:
    with httpx.Client(timeout=30.0) as client:
        headers = _auth_headers(client)
        auth_only_headers = {"Authorization": headers["Authorization"]}
        experiment_id = _first_experiment_id(client, headers)
    return {"headers": headers, "auth_only_headers": auth_only_headers, "experiment_id": experiment_id}


@pytest.fixture()
def provider_id(live_context: dict[str, str]) -> str:
    created_provider_id: str | None = None
    with httpx.Client(timeout=30.0) as client:
        headers = live_context["headers"]
        create_payload = {"name": f"cli-route-smoke-{uuid.uuid4().hex[:8]}", "type": "local", "config": {}}
        create_response = client.post(f"{BASE_URL}/compute_provider/providers/", headers=headers, json=create_payload)
        _assert_status_in(create_response, {200}, "POST /compute_provider/providers/")
        created_provider_id = create_response.json().get("id")
        assert created_provider_id, "Provider create response did not include id"

    try:
        return created_provider_id
    finally:
        if created_provider_id:
            with httpx.Client(timeout=30.0) as cleanup_client:
                cleanup_client.delete(
                    f"{BASE_URL}/compute_provider/providers/{created_provider_id}",
                    headers=live_context["headers"],
                )


def test_cli_auth_and_experiment_routes_live_server(live_context: dict[str, str]) -> None:
    with httpx.Client(timeout=30.0) as client:
        _assert_status_in(client.get(f"{BASE_URL}/healthz"), {200}, "GET /healthz")
        _assert_status_in(
            client.get(f"{BASE_URL}/users/me", headers=live_context["auth_only_headers"]),
            {200},
            "GET /users/me",
        )
        _assert_status_in(
            client.get(f"{BASE_URL}/users/me/teams", headers=live_context["auth_only_headers"]),
            {200},
            "GET /users/me/teams",
        )
        _assert_status_in(
            client.get(f"{BASE_URL}/experiment/", headers=live_context["headers"]),
            {200},
            "GET /experiment/",
        )


def test_cli_compute_provider_routes_live_server(live_context: dict[str, str], provider_id: str) -> None:
    headers = live_context["headers"]
    with httpx.Client(timeout=30.0) as client:
        _assert_status_in(
            client.get(f"{BASE_URL}/compute_provider/providers/?include_disabled=false", headers=headers),
            {200},
            "GET /compute_provider/providers/",
        )
        provider_info_response = _get_with_retry(
            client,
            f"{BASE_URL}/compute_provider/providers/{provider_id}",
            headers,
        )
        _assert_status_in(provider_info_response, {200, 404}, "GET /compute_provider/providers/{id}")
        _assert_status_in(
            client.get(f"{BASE_URL}/compute_provider/providers/{provider_id}/check", headers=headers),
            {200, 400, 404, 422},
            "GET /compute_provider/providers/{id}/check",
        )
        _assert_status_in(
            client.patch(
                f"{BASE_URL}/compute_provider/providers/{provider_id}", headers=headers, json={"disabled": True}
            ),
            {200, 404},
            "PATCH /compute_provider/providers/{id} disable",
        )
        _assert_status_in(
            client.patch(
                f"{BASE_URL}/compute_provider/providers/{provider_id}", headers=headers, json={"disabled": False}
            ),
            {200, 404},
            "PATCH /compute_provider/providers/{id} enable",
        )
        _assert_status_in(
            client.post(f"{BASE_URL}/compute_provider/providers/{provider_id}/launch/", headers=headers, json={}),
            {200, 202, 400, 404, 422},
            "POST /compute_provider/providers/{id}/launch/",
        )


def test_cli_task_routes_live_server(live_context: dict[str, str]) -> None:
    headers = live_context["headers"]
    experiment_id = live_context["experiment_id"]
    fake_task_id = "route-smoke-task-id"

    with httpx.Client(timeout=30.0) as client:
        _assert_status_in(
            client.get(
                f"{BASE_URL}/experiment/{experiment_id}/task/list_by_type_in_experiment?type=REMOTE", headers=headers
            ),
            {200},
            "GET /experiment/{id}/task/list_by_type_in_experiment",
        )
        _assert_status_in(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/task/gallery", headers=headers),
            {200},
            "GET /experiment/{id}/task/gallery",
        )
        _assert_status_in(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/task/gallery/interactive", headers=headers),
            {200},
            "GET /experiment/{id}/task/gallery/interactive",
        )
        _assert_status_in(
            client.post(
                f"{BASE_URL}/experiment/{experiment_id}/task/validate",
                headers={**headers, "Content-Type": "text/plain"},
                content="name: smoke\nrun: echo hi\ntype: trainer\n",
            ),
            {200, 400, 422},
            "POST /experiment/{id}/task/validate",
        )
        _assert_missing_contract(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/task/{fake_task_id}/get", headers=headers),
            "GET /experiment/{id}/task/{task_id}/get",
        )
        _assert_status_in(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/task/{fake_task_id}/delete", headers=headers),
            {200, 404},
            "GET /experiment/{id}/task/{task_id}/delete",
        )
        _assert_status_in(
            client.post(
                f"{BASE_URL}/experiment/{experiment_id}/task/create",
                headers=headers,
                json={"github_repo_url": "https://github.com/does-not-exist/repo"},
            ),
            {200, 400, 404, 422},
            "POST /experiment/{id}/task/create (json)",
        )
        _assert_status_in(
            client.post(
                f"{BASE_URL}/experiment/{experiment_id}/task/gallery/import",
                headers=headers,
                json={"gallery_id": "route-smoke-gallery-id", "experiment_id": experiment_id, "is_interactive": False},
            ),
            {200, 400, 404, 422},
            "POST /experiment/{id}/task/gallery/import",
        )


def test_cli_job_and_artifact_routes_live_server(live_context: dict[str, str]) -> None:
    headers = live_context["headers"]
    experiment_id = live_context["experiment_id"]
    fake_job_id = "route-smoke-job-id"

    with httpx.Client(timeout=30.0) as client:
        _assert_status_in(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/jobs/list?type=REMOTE", headers=headers),
            {200},
            "GET /experiment/{id}/jobs/list",
        )
        _assert_stop_contract(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/jobs/{fake_job_id}/stop", headers=headers),
            "GET /experiment/{id}/jobs/{job_id}/stop",
        )
        _assert_stream_or_logs_missing_contract(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/jobs/{fake_job_id}/provider_logs", headers=headers),
            "GET /experiment/{id}/jobs/{job_id}/provider_logs",
        )
        _assert_stream_or_logs_missing_contract(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/jobs/{fake_job_id}/stream_output", headers=headers),
            "GET /experiment/{id}/jobs/{job_id}/stream_output",
        )
        _assert_stream_or_logs_missing_contract(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/jobs/{fake_job_id}/request_logs", headers=headers),
            "GET /experiment/{id}/jobs/{job_id}/request_logs",
        )
        _assert_missing_contract(
            client.get(f"{BASE_URL}/experiment/{experiment_id}/jobs/{fake_job_id}/tunnel_info", headers=headers),
            "GET /experiment/{id}/jobs/{job_id}/tunnel_info",
        )
        _assert_status_in(
            client.get(f"{BASE_URL}/jobs/{fake_job_id}/artifacts", headers=headers),
            {200, 400, 404},
            "GET /jobs/{job_id}/artifacts",
        )
        _assert_status_in(
            client.get(f"{BASE_URL}/jobs/{fake_job_id}/artifact/does-not-exist.txt?task=download", headers=headers),
            {400, 404, 405},
            "GET /jobs/{job_id}/artifact/{filename}",
        )
        _assert_status_in(
            client.get(f"{BASE_URL}/jobs/{fake_job_id}/artifacts/download_all", headers=headers),
            {400, 404},
            "GET /jobs/{job_id}/artifacts/download_all",
        )
        _assert_status_in(
            client.post(
                f"{BASE_URL}/experiment/{experiment_id}/jobs/{fake_job_id}/datasets/does-not-exist/save_to_registry"
                "?mode=new&tag=latest&version_label=v1",
                headers=headers,
            ),
            {400, 404, 422},
            "POST /experiment/{id}/jobs/{job_id}/datasets/{name}/save_to_registry",
        )
        _assert_status_in(
            client.post(
                f"{BASE_URL}/experiment/{experiment_id}/jobs/{fake_job_id}/models/does-not-exist/save_to_registry"
                "?mode=new&tag=latest&version_label=v1",
                headers=headers,
            ),
            {400, 404, 422},
            "POST /experiment/{id}/jobs/{job_id}/models/{name}/save_to_registry",
        )
