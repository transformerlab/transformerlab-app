from unittest.mock import AsyncMock, patch

import pytest

from transformerlab.services import notification_service


@pytest.mark.asyncio
async def test_send_storage_alert_posts_when_enabled():
    posted = {}

    async def fake_post(url, request_body):
        posted["url"] = url
        posted["body"] = request_body

    async def fake_config_get(key, **kwargs):
        if key == "notification_enabled":
            return "true"
        if key == "notification_webhook_url":
            return "https://example.com/webhook"
        return None

    with (
        patch.object(notification_service.db, "config_get", new=AsyncMock(side_effect=fake_config_get)),
        patch.object(notification_service, "_post_webhook", new=AsyncMock(side_effect=fake_post)) as post,
    ):
        await notification_service.send_storage_alert(
            team_id="t1",
            scope="org",
            subject="t1",
            used_gb=12.0,
            limit_gb=10.0,
        )

    post.assert_awaited_once()
    assert posted["url"] == "https://example.com/webhook"
    # The webhook body should contain the human-readable alert message somewhere.
    body_text = str(posted["body"]).lower()
    assert "storage" in body_text
    assert "12.0" in body_text
    assert "10.0" in body_text


@pytest.mark.asyncio
async def test_send_storage_alert_noop_when_disabled():
    async def fake_config_get(key, **kwargs):
        if key == "notification_enabled":
            return "false"
        if key == "notification_webhook_url":
            return "https://example.com/webhook"
        return None

    with (
        patch.object(notification_service.db, "config_get", new=AsyncMock(side_effect=fake_config_get)),
        patch.object(notification_service, "_post_webhook", new=AsyncMock()) as post,
    ):
        await notification_service.send_storage_alert(
            team_id="t1",
            scope="org",
            subject="t1",
            used_gb=12.0,
            limit_gb=10.0,
        )

    post.assert_not_called()


@pytest.mark.asyncio
async def test_send_storage_alert_noop_when_no_url():
    async def fake_config_get(key, **kwargs):
        if key == "notification_enabled":
            return "true"
        return None  # no webhook url

    with (
        patch.object(notification_service.db, "config_get", new=AsyncMock(side_effect=fake_config_get)),
        patch.object(notification_service, "_post_webhook", new=AsyncMock()) as post,
    ):
        await notification_service.send_storage_alert(
            team_id="t1",
            scope="org",
            subject="t1",
            used_gb=12.0,
            limit_gb=10.0,
        )

    post.assert_not_called()
