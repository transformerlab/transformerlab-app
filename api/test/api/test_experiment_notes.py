import uuid


def test_experiment_save_notes_limit(client):
    """Test that saving experiment notes > 50,000 characters fails."""
    # Create an experiment with a unique name
    unique_name = f"test_notes_limit_{uuid.uuid4().hex}"
    resp = client.get(f"/experiment/create?name={unique_name}")
    assert resp.status_code == 200
    exp_id = resp.json()

    # Generate content > 50,000 characters
    long_content = "a" * 50001

    # Attempt to save
    response = client.post(f"/experiment/{exp_id}/save_file_contents?filename=readme.md", json=long_content)

    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "error"
    assert "exceeds the limit" in data.get("message")


def test_experiment_save_notes_success(client):
    """Test that saving experiment notes < 50,000 characters succeeds."""
    # Create an experiment with a unique name
    unique_name = f"test_notes_success_{uuid.uuid4().hex}"
    resp = client.get(f"/experiment/create?name={unique_name}")
    assert resp.status_code == 200
    exp_id = resp.json()
    # If exp_id is a dict (error), assertion will fail later, but let's assume it returns ID as string/related
    # The existing code returns "newid" which is a string.

    # Generate content < 50,000 characters
    valid_content = "a" * 100

    # Attempt to save
    response = client.post(f"/experiment/{exp_id}/save_file_contents?filename=readme.md", json=valid_content)

    assert response.status_code == 200
    data = response.json()
    assert "saved" in data.get("message")
