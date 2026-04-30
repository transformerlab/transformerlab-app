def _stage(client, content: bytes, filename: str = "train.jsonl") -> str:
    init = client.post("/upload/init", json={"filename": filename, "total_size": len(content)})
    upload_id = init.json()["upload_id"]
    chunk_size = init.json()["chunk_size"]
    total = max(1, (len(content) + chunk_size - 1) // chunk_size)
    for i in range(total):
        blk = content[i * chunk_size : (i + 1) * chunk_size]
        client.put(f"/upload/{upload_id}/chunk?chunk_index={i}", content=blk)
    client.post(f"/upload/{upload_id}/complete", json={"total_chunks": total})
    return upload_id


def test_dataset_fileupload_relpath(client):
    upload_id = _stage(client, b'{"a":1}\n', filename="train.jsonl")
    r = client.post(f"/data/fileupload?dataset_id=ds-up-1&upload_id={upload_id}&relpath=splits/train.jsonl")
    assert r.status_code == 200, r.text


def test_dataset_files_and_file(client):
    upload_id = _stage(client, b"hello", filename="a.txt")
    r = client.post(f"/data/fileupload?dataset_id=ds-dl-1&upload_id={upload_id}&relpath=a.txt")
    assert r.status_code == 200, r.text

    r = client.get("/data/files?dataset_id=ds-dl-1")
    assert r.status_code == 200, r.text
    by_rel = {f["relpath"]: f["size"] for f in r.json()}
    assert by_rel["a.txt"] == 5

    r = client.get("/data/file?dataset_id=ds-dl-1&relpath=a.txt")
    assert r.status_code == 200
    assert r.content == b"hello"


def test_dataset_file_range(client):
    body = b"0123456789" * 5
    upload_id = _stage(client, body, filename="data.bin")
    client.post(f"/data/fileupload?dataset_id=ds-dl-2&upload_id={upload_id}&relpath=data.bin")
    r = client.get(
        "/data/file?dataset_id=ds-dl-2&relpath=data.bin",
        headers={"Range": "bytes=20-"},
    )
    assert r.status_code == 206
    assert r.content == body[20:]


def test_dataset_fileupload_conflict_without_force(client):
    upload_a = _stage(client, b"first", filename="a.txt")
    client.post(f"/data/fileupload?dataset_id=ds-up-2&upload_id={upload_a}&relpath=a.txt")
    upload_b = _stage(client, b"second", filename="a.txt")
    r = client.post(f"/data/fileupload?dataset_id=ds-up-2&upload_id={upload_b}&relpath=a.txt")
    assert r.status_code == 409


def test_dataset_files_missing_dataset(client):
    r = client.get("/data/files?dataset_id=does-not-exist")
    assert r.status_code == 404
