import pytest
import os
import json
import asyncio
from io import BytesIO
from PIL import Image
from pathlib import Path
from lab import dirs
from transformerlab.shared.shared import slugify


def cleanup_dataset(dataset_id, client):
    from lab import dirs
    from transformerlab.shared.shared import slugify
    import shutil

    dataset_dir = asyncio.run(dirs.dataset_dir_by_id(slugify(dataset_id)))
    shutil.rmtree(dataset_dir, ignore_errors=True)
    client.get(f"/data/delete?dataset_id={dataset_id}")


def test_data_gallery(client):
    resp = client.get("/data/gallery")
    assert resp.status_code == 200
    assert "data" in resp.json() or "status" in resp.json()


def test_data_list(client):
    resp = client.get("/data/list")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) or isinstance(resp.json(), dict)


def test_data_preview(client):
    resp = client.get("/data/preview?dataset_id=dummy_dataset")
    assert resp.status_code in (200, 400, 404)


def test_data_preview_trelis_touch_rugby_rules(client):
    resp = client.get("/data/preview", params={"dataset_id": "Trelis/touch-rugby-rules", "limit": 2})
    assert resp.status_code in (200, 400, 404)
    if resp.status_code == 200 and resp.json().get("status") == "success":
        data = resp.json()["data"]
        assert "len" in data
        # Should have either columns or rows
        assert "columns" in data or "rows" in data


def test_data_info(client):
    resp = client.get("/data/info?dataset_id=dummy_dataset")
    assert resp.status_code in (200, 400, 404)


@pytest.mark.skip(reason="Skipping as it contains application-specific logic")
def test_save_metadata(client):
    source_dataset_id = "source_dataset"
    new_dataset_id = "destination_dataset"
    dataset_dir = asyncio.run(dirs.dataset_dir_by_id(slugify(source_dataset_id)))
    os.makedirs(dataset_dir, exist_ok=True)

    # Create dummy JPEG image
    image_path = os.path.join(dataset_dir, "image.jpg")
    with open(image_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0" + b"JPEG DUMMY" + b"\xff\xd9")

    # Prepare metadata JSONL
    metadata_content = json.dumps({"file_name": "image.jpg", "text": "sample caption"}) + "\n"
    metadata_filename = "metadata.jsonl"

    # Upload metadata
    files = {"files": (metadata_filename, BytesIO(metadata_content.encode()), "application/jsonl")}
    response = client.post(f"/data/fileupload?dataset_id={source_dataset_id}", files=files)
    assert response.status_code == 200

    # Register the dataset via /data/new or manually (adjust if needed)
    register_response = client.get(f"/data/new?dataset_id={source_dataset_id}")
    assert register_response.status_code in (200, 400)

    updates = [
        {
            "file_name": "image1.jpg",
            "previous_label": "cat",
            "previous_split": "train",
            "previous_caption": "Old Caption",
            "label": "cat",
            "split": "train",
            "caption": "New Caption",
        }
    ]
    updates_json = BytesIO(json.dumps(updates).encode("utf-8"))

    response = client.post(
        f"/data/save_metadata?dataset_id={source_dataset_id}&new_dataset_id={new_dataset_id}",
        files={"file": ("metadata_updates.json", updates_json, "application/json")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"

    new_dataset_dir = Path(asyncio.run(dirs.dataset_dir_by_id(slugify(new_dataset_id))))
    assert new_dataset_dir.exists()

    cleanup_dataset(source_dataset_id, client)
    cleanup_dataset(new_dataset_id, client)


@pytest.mark.skip(reason="Skipping as it contains application-specific logic")
def test_edit_with_template(client):
    dataset_id = "test_dataset"
    dataset_dir = asyncio.run(dirs.dataset_dir_by_id(slugify(dataset_id)))
    os.makedirs(dataset_dir, exist_ok=True)

    image_path = os.path.join(dataset_dir, "image.jpg")
    image = Image.new("RGB", (100, 100), color="red")
    image.save(image_path, "JPEG")

    metadata_content = (
        json.dumps({"file_name": "image.jpg", "text": "sample caption", "label": "cat", "split": "train"}) + "\n"
    )
    metadata_filename = "metadata.jsonl"

    files = {"files": (metadata_filename, BytesIO(metadata_content.encode()), "application/jsonl")}
    response = client.post(f"/data/fileupload?dataset_id={dataset_id}", files=files)
    assert response.status_code == 200

    register_response = client.get(f"/data/new?dataset_id={dataset_id}")
    assert register_response.status_code in (200, 400)

    response = client.get(f"/data/edit_with_template?dataset_id={dataset_id}&template=")
    assert response.status_code == 200
    data = response.json()
    print("Response JSON:", data)
    assert data["status"] == "success"
    rows = data["data"]["rows"]
    assert len(rows) > 0
    row = rows[0]
    assert "file_name" in row
    assert "image" in row
    assert "text" in row
    assert "label" in row
    assert "split" in row

    cleanup_dataset(dataset_id, client)
