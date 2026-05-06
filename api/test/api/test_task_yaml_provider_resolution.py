from unittest.mock import AsyncMock, patch

import pytest
from starlette.requests import Request

from transformerlab.routers.experiment import task as task_router


def _build_request(body: str) -> Request:
    async def receive():
        return {"type": "http.request", "body": body.encode("utf-8"), "more_body": False}

    scope = {"type": "http", "method": "PUT", "path": "/"}
    return Request(scope, receive)


@pytest.mark.asyncio
async def test_update_task_yaml_resolves_provider_id_when_compute_provider_present():
    request = _build_request("name: demo\nresources:\n  compute_provider: NewProvider\nrun: echo hello\n")

    async def fake_resolve_provider(task_data, user_and_team, session):
        task_data["provider_id"] = "provider-new-id"
        task_data["provider_name"] = "NewProvider"

    with (
        patch.object(task_router, "_resolve_provider", new=fake_resolve_provider),
        patch.object(
            task_router.task_service, "task_get_by_id", new=AsyncMock(return_value={"id": "t1", "subtype": "remote"})
        ),
        patch.object(task_router.task_service, "write_task_yaml", new=AsyncMock()),
        patch.object(
            task_router.task_service, "update_task_from_yaml", new=AsyncMock(return_value=True)
        ) as mock_update,
    ):
        response = await task_router.update_task_yaml(
            experimentId="exp1",
            task_id="t1",
            request=request,
            user_and_team={"team_id": "team1"},
            session=object(),
        )

    assert response == {"message": "OK"}
    update_payload = mock_update.await_args.args[1]
    assert update_payload["provider_name"] == "NewProvider"
    assert update_payload["provider_id"] == "provider-new-id"
