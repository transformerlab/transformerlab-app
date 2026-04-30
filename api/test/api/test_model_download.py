def _seed_model(client, model_id: str, files: dict):
    """Helper: upload {relpath: bytes} into a fresh model via /upload + /model/fileupload."""
    for relpath, content in files.items():
        init = client.post("/upload/init", json={"filename": relpath.split("/")[-1], "total_size": len(content)})
        upload_id = init.json()["upload_id"]
        chunk_size = init.json()["chunk_size"]
        total_chunks = max(1, (len(content) + chunk_size - 1) // chunk_size)
        for i in range(total_chunks):
            blk = content[i * chunk_size : (i + 1) * chunk_size]
            r = client.put(f"/upload/{upload_id}/chunk?chunk_index={i}", content=blk)
            assert r.status_code == 200
        r = client.post(f"/upload/{upload_id}/complete", json={"total_chunks": total_chunks})
        assert r.status_code == 200
        r = client.post(f"/model/fileupload?model_id={model_id}&upload_id={upload_id}&relpath={relpath}")
        assert r.status_code == 200, r.text


def test_model_files_lists_relpaths_and_sizes(client):
    _seed_model(
        client,
        "test-dl-1",
        {
            "config.json": b'{"x":1}',
            "sub/weights.bin": b"x" * 64,
        },
    )
    r = client.get("/model/files?model_id=test-dl-1")
    assert r.status_code == 200, r.text
    by_rel = {f["relpath"]: f["size"] for f in r.json()}
    assert by_rel["config.json"] == 7
    assert by_rel["sub/weights.bin"] == 64


def test_model_file_full(client):
    _seed_model(client, "test-dl-2", {"config.json": b"hello"})
    r = client.get("/model/file?model_id=test-dl-2&relpath=config.json")
    assert r.status_code == 200
    assert r.content == b"hello"
    assert r.headers["content-length"] == "5"
    assert r.headers["accept-ranges"] == "bytes"


def test_model_file_range_partial(client):
    body = b"abcdefghij" * 10  # 100 bytes
    _seed_model(client, "test-dl-3", {"weights.bin": body})
    r = client.get(
        "/model/file?model_id=test-dl-3&relpath=weights.bin",
        headers={"Range": "bytes=10-"},
    )
    assert r.status_code == 206
    assert r.content == body[10:]
    assert r.headers["content-range"] == "bytes 10-99/100"


def test_model_file_traversal_rejected(client):
    _seed_model(client, "test-dl-4", {"config.json": b"x"})
    r = client.get("/model/file?model_id=test-dl-4&relpath=../etc/passwd")
    assert r.status_code == 400


def test_model_files_missing_model(client):
    r = client.get("/model/files?model_id=does-not-exist")
    assert r.status_code == 404
