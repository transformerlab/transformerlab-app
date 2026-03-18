import uuid


def test_team_gallery_add_import_export_round_trip(client):
    exp_id = f"t_exp_{uuid.uuid4().hex[:10]}"
    r = client.get("/experiment/create", params={"name": exp_id})
    assert r.status_code == 200

    title = f"TFL Team Gallery Task {uuid.uuid4().hex[:8]}"
    add_payload = {
        "title": title,
        "description": "test task for team gallery add/import/export",
        "setup": "echo setup",
        "run": "echo hello",
        "cpus": "1",
        "memory": "1Gi",
    }
    r = client.post(f"/experiment/{exp_id}/task/gallery/team/add", json=add_payload)
    assert r.status_code == 200, r.text
    add_data = r.json()
    assert add_data["status"] == "success"
    gallery_entry = add_data["data"]
    assert gallery_entry["id"]

    import_payload = {"gallery_id": gallery_entry["id"], "experiment_id": exp_id, "is_interactive": False}
    r = client.post(f"/experiment/{exp_id}/task/gallery/team/import", json=import_payload)
    assert r.status_code == 200, r.text
    import_data = r.json()
    assert import_data["status"] == "success"
    imported_task_id = import_data["id"]
    assert imported_task_id

    export_payload = {"task_id": imported_task_id}
    r = client.post(f"/experiment/{exp_id}/task/gallery/team/export", json=export_payload)
    assert r.status_code == 200, r.text
    export_data = r.json()
    assert export_data["status"] == "success"
    exported_entry = export_data["data"]
    assert exported_entry["id"]
    assert exported_entry.get("local_task_dir")

    # Prove export -> import round-trip works (filesystem-backed import via local_task_dir).
    reimport_payload = {"gallery_id": exported_entry["id"], "experiment_id": exp_id, "is_interactive": False}
    r = client.post(f"/experiment/{exp_id}/task/gallery/team/import", json=reimport_payload)
    assert r.status_code == 200, r.text
    reimport_data = r.json()
    assert reimport_data["status"] == "success"
    assert reimport_data["id"]

