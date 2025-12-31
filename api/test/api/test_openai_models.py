from unittest.mock import AsyncMock, patch


def _mock_async_client(*responses):
    """Create a mock httpx.AsyncClient instance that returns the given responses in order."""

    class _Client:
        def __init__(self):
            self.post = AsyncMock(side_effect=list(responses))

    client = _Client()

    class _AsyncClientCtx:
        async def __aenter__(self):
            return client

        async def __aexit__(self, exc_type, exc, tb):
            return False

    return client, _AsyncClientCtx


def test_v1_models_returns_empty_permissions_and_sorted_models(client):
    mock_list_models_resp = AsyncMock()
    mock_list_models_resp.json.return_value = {"models": ["b", "a"]}

    _, async_client_ctx = _mock_async_client(mock_list_models_resp)

    with patch("transformerlab.fastchat_openai_api.httpx.AsyncClient", async_client_ctx):
        resp = client.get("/v1/models")

    assert resp.status_code == 200
    data = resp.json()

    assert [m["id"] for m in data["data"]] == ["a", "b"]
    assert all(m["permission"] == [] for m in data["data"])


def test_v1_models_refreshes_workers_when_no_models_returned(client):
    empty_models_resp = AsyncMock()
    empty_models_resp.json.return_value = {"models": []}

    refresh_resp = AsyncMock()
    refresh_resp.json.return_value = {}

    models_after_refresh_resp = AsyncMock()
    models_after_refresh_resp.json.return_value = {"models": ["m1"]}

    mock_client, async_client_ctx = _mock_async_client(
        empty_models_resp,
        refresh_resp,
        models_after_refresh_resp,
    )

    with patch("transformerlab.fastchat_openai_api.httpx.AsyncClient", async_client_ctx):
        resp = client.get("/v1/models")

    assert resp.status_code == 200
    data = resp.json()
    assert [m["id"] for m in data["data"]] == ["m1"]
    assert data["data"][0]["permission"] == []

    assert mock_client.post.await_count == 3
    assert mock_client.post.await_args_list[0].args[0].endswith("/list_models")
    assert mock_client.post.await_args_list[1].args[0].endswith("/refresh_all_workers")
    assert mock_client.post.await_args_list[2].args[0].endswith("/list_models")
