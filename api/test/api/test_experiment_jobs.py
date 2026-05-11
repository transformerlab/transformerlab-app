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

    # slim mode is opt-in and should still return a 2xx (or 404) response shape
    resp = client.get("/experiment/alpha/jobs/list?slim=true")
    assert resp.status_code in (200, 404)


def test_slim_job_drops_heavy_keys_only():
    """_slim_job should remove the denylisted keys but preserve everything else."""
    from transformerlab.routers.experiment.jobs import _slim_job, _SLIM_JOB_DATA_DROPPED_KEYS

    job = {
        "id": "abc",
        "status": "COMPLETE",
        "type": "TRAIN",
        "job_data": {
            # Heavy keys that the list view does not need
            "cluster_config": {"x": "y"},
            "env_vars": {"TOKEN": "secret"},
            "setup": "long shell script",
            "run": "another long shell script",
            "parameters": {"lr": 0.001, "batch": 32},
            "config": {"big": "blob"},
            "file_mounts": {"/foo": "/bar"},
            "accelerators": "A100",
            "cpus": 8,
            "memory": "32GB",
            "disk_space": "200GB",
            "num_nodes": 2,
            "command": "bash run.sh",
            "provider_jobs_seen_once": ["a", "b"],
            "provider_empty_jobs_polls": 5,
            # Keys the list view does need — these must survive
            "description": "hello",
            "start_time": "2025-01-01T00:00:00Z",
            "score": {"acc": 0.9},
            "subtype": "interactive",
            "favorite": True,
            "hidden": False,
            "tags": ["a"],
            "wandb_run_url": "https://wandb.ai/x/y/runs/z",
            "error_msg": None,
            "stop_requested": False,
            "eval_results": ["/path/to/results.csv"],
            "cached_tunnel_info": {"is_ready": True, "url": "https://x"},
            "provider_launch_result": {"request_id": "req-1", "instance_ids": ["i-1"]},
        },
    }

    slim = _slim_job(job)

    # Top-level keys are untouched
    assert slim["id"] == "abc"
    assert slim["status"] == "COMPLETE"
    assert slim["type"] == "TRAIN"

    slim_data = slim["job_data"]
    # Every denylisted key must be gone
    for key in _SLIM_JOB_DATA_DROPPED_KEYS:
        assert key not in slim_data, f"slim mode leaked heavy key: {key}"

    # Frontend-relevant keys must be preserved verbatim
    for key in (
        "description",
        "start_time",
        "score",
        "subtype",
        "favorite",
        "hidden",
        "tags",
        "wandb_run_url",
        "error_msg",
        "stop_requested",
        "eval_results",
        "cached_tunnel_info",
        "provider_launch_result",
    ):
        assert key in slim_data, f"slim mode dropped expected key: {key}"
        assert slim_data[key] == job["job_data"][key]

    # The original job dict is not mutated (defensive copy)
    assert "cluster_config" in job["job_data"]
    assert "env_vars" in job["job_data"]


def test_slim_job_handles_non_dict_job_data():
    """_slim_job should be a no-op when job_data is missing or not a dict."""
    from transformerlab.routers.experiment.jobs import _slim_job

    # Missing job_data
    job = {"id": "1", "status": "RUNNING"}
    assert _slim_job(job) == job

    # job_data is a string (legacy/mis-serialized) — leave it alone rather than crash
    job_str = {"id": "2", "job_data": '{"cluster_config": "x"}'}
    assert _slim_job(job_str) == job_str


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
    resp = client.delete("/experiment/alpha/jobs/1")
    assert resp.status_code in (200, 404)

    # Test delete all jobs
    resp = client.delete("/experiment/alpha/jobs/delete_all")
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

    # One-shot JSON task logs (sibling of SSE /stream_output, used by `lab job task-logs`)
    resp = client.get("/experiment/1/jobs/1/task_logs")
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        body = resp.json()
        assert "logs" in body
        assert "tail_lines" in body

    # tail_lines query param respected
    resp = client.get("/experiment/1/jobs/1/task_logs?tail_lines=200")
    assert resp.status_code in (200, 404)

    # tail_lines validation: out-of-range should be rejected
    resp = client.get("/experiment/1/jobs/1/task_logs?tail_lines=10")
    assert resp.status_code in (400, 422)


def test_job_detailed_reports(client):
    """Test detailed job reporting endpoints"""
    # Test detailed JSON report
    resp = client.get("/experiment/alpha/jobs/1/stream_detailed_json_report?file_name=/tmp/test.json")
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
