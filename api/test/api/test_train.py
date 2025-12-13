def test_train_export_recipe(client):
    resp = client.get("/train/template/1/export")
    assert resp.status_code in (200, 404)
