import pytest

pytestmark = pytest.mark.skip(reason="Moving to another auth method")


def test_register_user(client):
    new_user = {
        "email": "pytest@test.com",
        "password": "password",
    }
    resp = client.post("/auth/register", json=new_user)

    # Success = HTTP 201 with a field called "id"
    # Already exists = HTTP 400 with a field called "detail"
    # (vs. a bad request which is HTTP 400 and a FastAPI error)
    assert resp.status_code in (201, 400)
    resp_json = resp.json()
    print(resp_json)
    assert "id" in resp_json or resp_json.get("detail", "") == "REGISTER_USER_ALREADY_EXISTS"
