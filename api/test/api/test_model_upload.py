from fastapi.testclient import TestClient


def _stage_file(client: TestClient, content: bytes, filename: str = "config.json") -> str:
    """Helper: push a file through /upload/{init,chunk,complete} and return upload_id."""
    init = client.post("/upload/init", json={"filename": filename, "total_size": len(content)})
    assert init.status_code == 200, init.text
    upload_id = init.json()["upload_id"]
    chunk_size = init.json()["chunk_size"]
    total_chunks = max(1, (len(content) + chunk_size - 1) // chunk_size)
    for i in range(total_chunks):
        blk = content[i * chunk_size : (i + 1) * chunk_size]
        r = client.put(f"/upload/{upload_id}/chunk?chunk_index={i}", content=blk)
        assert r.status_code == 200, r.text
    r = client.post(f"/upload/{upload_id}/complete", json={"total_chunks": total_chunks})
    assert r.status_code == 200, r.text
    return upload_id


def test_model_fileupload_creates_model_and_writes(client):
    upload_id = _stage_file(client, b'{"architectures": ["LlamaForCausalLM"]}')
    r = client.post(f"/model/fileupload?model_id=test-up-1&upload_id={upload_id}&relpath=config.json")
    assert r.status_code == 200, r.text
    # File should exist under workspace/models/test-up-1/config.json
    list_resp = client.get("/model/list")
    ids = [m["model_id"] for m in list_resp.json()]
    assert "test-up-1" in ids


def test_model_fileupload_relpath_subdir(client):
    upload_id = _stage_file(client, b"x" * 32, filename="weights.bin")
    r = client.post(f"/model/fileupload?model_id=test-up-2&upload_id={upload_id}&relpath=sub/weights.bin")
    assert r.status_code == 200, r.text


def test_model_fileupload_traversal_rejected(client):
    upload_id = _stage_file(client, b"x")
    r = client.post(f"/model/fileupload?model_id=test-up-3&upload_id={upload_id}&relpath=../escape.bin")
    assert r.status_code == 400


def test_model_fileupload_conflict_without_force(client):
    upload_id_a = _stage_file(client, b"first")
    r = client.post(f"/model/fileupload?model_id=test-up-4&upload_id={upload_id_a}&relpath=config.json")
    assert r.status_code == 200
    upload_id_b = _stage_file(client, b"second")
    r = client.post(f"/model/fileupload?model_id=test-up-4&upload_id={upload_id_b}&relpath=config.json")
    assert r.status_code == 409


def test_model_fileupload_force_overwrites(client):
    upload_id_a = _stage_file(client, b'{"architectures": ["A"]}')
    client.post(f"/model/fileupload?model_id=test-up-5&upload_id={upload_id_a}&relpath=config.json")
    upload_id_b = _stage_file(client, b'{"architectures": ["B"]}')
    r = client.post(f"/model/fileupload?model_id=test-up-5&upload_id={upload_id_b}&relpath=config.json&force=true")
    assert r.status_code == 200, r.text


def test_model_finalize_writes_index_with_architecture(client):
    upload_id = _stage_file(client, b'{"architectures": ["LlamaForCausalLM"]}')
    client.post(f"/model/fileupload?model_id=test-up-6&upload_id={upload_id}&relpath=config.json")
    r = client.post("/model/finalize?model_id=test-up-6")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["architecture"] == "LlamaForCausalLM"


def test_model_finalize_without_config_returns_400(client):
    upload_id = _stage_file(client, b"random bytes", filename="weights.bin")
    client.post(f"/model/fileupload?model_id=test-up-7&upload_id={upload_id}&relpath=weights.bin")
    r = client.post("/model/finalize?model_id=test-up-7")
    assert r.status_code == 400
