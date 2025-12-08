def test_jobs_list_all_endpoints(client):
    """Test all job listing endpoints"""
    # Test basic jobs list
    resp = client.get("/experiment/alpha/jobs/list")
    assert resp.status_code in (200, 404)

    # Test with filters
    resp = client.get("/experiment/alpha/jobs/list?type=TRAIN")
    assert resp.status_code in (200, 404)

    resp = client.get("/experiment/alpha/jobs/list?status=RUNNING")
    assert resp.status_code in (200, 404)

    resp = client.get("/experiment/alpha/jobs/list?type=TRAIN&status=QUEUED")
    assert resp.status_code in (200, 404)


def test_job_creation_and_management(client):
    """Test job creation and management endpoints"""
    # Test job creation
    resp = client.get("/experiment/alpha/jobs/create?type=TRAIN&status=CREATED&data={}")
    assert resp.status_code in (200, 404)

    # Test job update
    resp = client.get("/experiment/alpha/jobs/update/1?status=RUNNING")
    assert resp.status_code in (200, 404)

    # Test job stop
    resp = client.get("/experiment/alpha/jobs/1/stop")
    assert resp.status_code in (200, 404)

    # Test job delete
    resp = client.get("/experiment/alpha/jobs/delete/1")
    assert resp.status_code in (200, 404)

    # Test delete all jobs
    resp = client.get("/experiment/alpha/jobs/delete_all")
    assert resp.status_code == 200


def test_job_output_endpoints(client):
    """Test job output related endpoints"""
    # Test basic job output
    resp = client.get("/experiment/1/jobs/1/output")
    assert resp.status_code in (200, 404)

    # Test job output with sweeps
    resp = client.get("/experiment/1/jobs/1/output?sweeps=true")
    assert resp.status_code in (200, 404)

    # # Test stream output
    # resp = client.get("/experiment/1/jobs/1/stream_output")
    # assert resp.status_code in (200, 404)

    # # Test stream output with sweeps
    # resp = client.get("/experiment/1/jobs/1/stream_output?sweeps=true")
    # assert resp.status_code in (200, 404)


def test_job_detailed_reports(client):
    """Test detailed job reporting endpoints"""
    # Test detailed JSON report
    resp = client.get(
        "/experiment/alpha/jobs/1/stream_detailed_json_report?file_name=/tmp/test.json"
    )
    assert resp.status_code in (200, 404)

    # Test additional details - this will fail if job_data doesn't have additional_output_path
    # We expect 404 for non-existent jobs, but the function has a bug for existing jobs without the field
    resp = client.get("/experiment/alpha/jobs/1/get_additional_details")
    assert resp.status_code in (200, 404)

    # Test additional details with download
    resp = client.get("/experiment/alpha/jobs/1/get_additional_details?task=download")
    assert resp.status_code in (200, 404)

    # Test figure JSON
    resp = client.get("/experiment/alpha/jobs/1/get_figure_json")
    assert resp.status_code in (200, 404)

    # Test generated dataset
    resp = client.get("/experiment/alpha/jobs/1/get_generated_dataset")
    assert resp.status_code in (200, 404)


def test_job_evaluation_images(client):
    """Test job evaluation image endpoints"""
    # Test get eval images list
    resp = client.get("/experiment/alpha/jobs/1/get_eval_images")
    assert resp.status_code in (200, 404)

    # Test get specific eval image
    resp = client.get("/experiment/alpha/jobs/1/image/test.png")
    assert resp.status_code in (200, 404)


def test_job_get_by_id(client):
    """Test getting job by ID"""
    resp = client.get("/experiment/alpha/jobs/1")
    assert resp.status_code in (200, 404)


def test_job_edge_cases(client):
    """Test edge cases and error conditions"""
    # Test with non-existent job ID
    resp = client.get("/experiment/alpha/jobs/999999")
    assert resp.status_code == 404

    # Test with invalid experiment ID and non-existent job ID
    resp = client.get("/experiment/experimental/jobs/999999")
    assert resp.status_code == 404

    # Test with valid job types
    resp = client.get("/experiment/alpha/jobs/create?type=TRAIN&status=CREATED&data={}")
    assert resp.status_code == 200

    resp = client.get("/experiment/alpha/jobs/create?type=DOWNLOAD_MODEL&status=QUEUED&data={}")
    assert resp.status_code == 200


def test_train_sweep_results(client):
    resp = client.get("/experiment/alpha/jobs/1/sweep_results")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert data["status"] in ("success", "error")
    if data["status"] == "success":
        assert "data" in data
    else:
        assert "message" in data
