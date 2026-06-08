from unittest.mock import AsyncMock

import pytest

from transformerlab.services import job_chart_service


def _job(
    job_id: str,
    created_at: str,
    score=None,
    discard=None,
    lower_is_better=None,
):
    job_data = {}
    if score is not None:
        job_data["score"] = score
    if discard is not None:
        job_data["discard"] = discard
    if lower_is_better is not None:
        job_data["lower_is_better"] = lower_is_better
    return {"id": job_id, "status": "COMPLETE", "created_at": created_at, "job_data": job_data}


SAMPLE_JOBS = [
    _job("job-1", "2026-01-01T10:00:00", score={"accuracy": 0.5}),
    _job("job-2", "2026-01-02T10:00:00", score={"accuracy": 0.7}),
    _job("job-3", "2026-01-03T10:00:00", score={"accuracy": 0.6}),
    _job("job-4", "2026-01-04T10:00:00", score={"accuracy": 0.9, "discard": True}),
    _job("job-5", "2026-01-05T10:00:00", score=None),
]


class TestParseNumericScoreFields:
    def test_dict_score(self):
        assert job_chart_service._parse_numeric_score_fields({"accuracy": 0.5, "f1": "0.6"}) == {
            "accuracy": 0.5,
            "f1": 0.6,
        }

    def test_scalar_score(self):
        assert job_chart_service._parse_numeric_score_fields(0.42) == {"score": 0.42}
        assert job_chart_service._parse_numeric_score_fields("0.42") == {"score": 0.42}

    def test_discard_key_excluded(self):
        assert job_chart_service._parse_numeric_score_fields({"accuracy": 0.5, "discard": 1}) == {"accuracy": 0.5}

    def test_non_numeric_values_skipped(self):
        assert job_chart_service._parse_numeric_score_fields({"note": "great", "loss": 1.2}) == {"loss": 1.2}

    def test_invalid_inputs(self):
        assert job_chart_service._parse_numeric_score_fields(None) == {}
        assert job_chart_service._parse_numeric_score_fields("not-a-number") == {}
        assert job_chart_service._parse_numeric_score_fields(True) == {}


class TestParseDiscardValue:
    @pytest.mark.parametrize("value", [True, 1, "1", "true", "True "])
    def test_truthy(self, value):
        assert job_chart_service._parse_discard_value(value) is True

    @pytest.mark.parametrize("value", [False, 0, "0", "false", None, "garbage", 2])
    def test_falsy(self, value):
        assert job_chart_service._parse_discard_value(value) is False


class TestComputePrimaryMetricKey:
    def test_prefers_score_key(self):
        jobs = [_job("j", "2026-01-01T00:00:00", score={"accuracy": 0.5, "score": 0.7})]
        assert job_chart_service.compute_primary_metric_key(jobs) == "score"

    def test_falls_back_to_first_key(self):
        jobs = [_job("j", "2026-01-01T00:00:00", score={"accuracy": 0.5, "f1": 0.6})]
        assert job_chart_service.compute_primary_metric_key(jobs) == "accuracy"

    def test_no_metrics(self):
        assert job_chart_service.compute_primary_metric_key([_job("j", "2026-01-01T00:00:00")]) is None


class TestResolveLowerIsBetter:
    def test_default_false(self):
        assert job_chart_service.resolve_lower_is_better(SAMPLE_JOBS) is False

    def test_majority_true(self):
        jobs = [
            _job("a", "2026-01-01T00:00:00", score={"loss": 1.0}, lower_is_better=True),
            _job("b", "2026-01-02T00:00:00", score={"loss": 0.9}, lower_is_better=True),
            _job("c", "2026-01-03T00:00:00", score={"loss": 0.8}, lower_is_better=False),
        ]
        assert job_chart_service.resolve_lower_is_better(jobs) is True


class TestBuildGraphModel:
    def test_points_sorted_and_filtered(self):
        model = job_chart_service.build_graph_model(SAMPLE_JOBS)
        # job-5 has no score so it is dropped
        assert [p.job_id for p in model.points] == ["job-1", "job-2", "job-3", "job-4"]
        assert model.primary_metric == "accuracy"
        assert model.axis_legend == "Score (accuracy)"

    def test_best_so_far_higher_is_better(self):
        model = job_chart_service.build_graph_model(SAMPLE_JOBS)
        best_ids = [p.job_id for p in model.best_for_step_line]
        # job-3 (0.6 < 0.7) is not best; job-4 is discarded despite 0.9
        assert best_ids == ["job-1", "job-2"]

    def test_best_so_far_lower_is_better(self):
        model = job_chart_service.build_graph_model(SAMPLE_JOBS, lower_is_better=True)
        best_ids = [p.job_id for p in model.best_for_step_line]
        assert best_ids == ["job-1"]

    def test_discarded_flag_from_score_and_job_data(self):
        jobs = [
            _job("a", "2026-01-01T00:00:00", score={"acc": 0.5, "discard": "true"}),
            _job("b", "2026-01-02T00:00:00", score={"acc": 0.6}, discard=1),
        ]
        model = job_chart_service.build_graph_model(jobs)
        assert all(p.discarded for p in model.points)
        assert model.best_for_step_line == []

    def test_explicit_metric_key(self):
        jobs = [_job("a", "2026-01-01T00:00:00", score={"accuracy": 0.5, "f1": 0.6})]
        model = job_chart_service.build_graph_model(jobs, metric_key="f1")
        assert model.points[0].y == 0.6
        assert model.axis_legend == "Score (f1)"

    def test_no_points_when_no_dates(self):
        jobs = [{"id": "a", "job_data": {"score": {"acc": 0.5}}}]
        model = job_chart_service.build_graph_model(jobs)
        assert model.points == []


class TestRenderChartPng:
    def test_returns_png_bytes(self):
        model = job_chart_service.build_graph_model(SAMPLE_JOBS)
        png = job_chart_service.render_chart_png(model)
        assert png.startswith(b"\x89PNG\r\n\x1a\n")


@pytest.mark.asyncio
class TestGenerateExperimentChartPng:
    async def test_renders_png(self, monkeypatch):
        monkeypatch.setattr(job_chart_service.job_service, "jobs_get_all", AsyncMock(return_value=SAMPLE_JOBS))
        png = await job_chart_service.generate_experiment_chart_png("exp-1")
        assert png.startswith(b"\x89PNG\r\n\x1a\n")

    async def test_no_scored_jobs_raises(self, monkeypatch):
        monkeypatch.setattr(job_chart_service.job_service, "jobs_get_all", AsyncMock(return_value=[]))
        with pytest.raises(job_chart_service.ChartDataError):
            await job_chart_service.generate_experiment_chart_png("exp-1")

    async def test_unknown_metric_raises(self, monkeypatch):
        monkeypatch.setattr(job_chart_service.job_service, "jobs_get_all", AsyncMock(return_value=SAMPLE_JOBS))
        with pytest.raises(job_chart_service.MetricNotFoundError):
            await job_chart_service.generate_experiment_chart_png("exp-1", metric="does-not-exist")
