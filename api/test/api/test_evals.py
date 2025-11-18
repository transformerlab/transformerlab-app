def test_evals_compare(client):
    resp = client.get("/evals/compare_evals?job_list=1,2,3")
    assert resp.status_code in (200, 400, 404)
