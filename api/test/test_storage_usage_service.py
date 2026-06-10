"""Tests for transformerlab.services.storage_usage_service.

These mock boto3/CloudWatch entirely — they are fast, deterministic, and never
touch AWS. They pin the parts most likely to break: parsing CloudWatch
responses, summing across storage classes, and aggregating per team.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import transformerlab.services.storage_usage_service as svc


# ==================== human_readable_bytes ====================


def test_human_readable_bytes_formats_each_unit():
    assert svc.human_readable_bytes(0) == "0 B"
    assert svc.human_readable_bytes(512) == "512 B"
    assert svc.human_readable_bytes(1536) == "1.5 KB"
    assert svc.human_readable_bytes(5 * 1024**3) == "5.0 GB"
    assert svc.human_readable_bytes(3 * 1024**4) == "3.0 TB"


# ==================== _chunked ====================


def test_chunked_splits_into_batches():
    assert list(svc._chunked([1, 2, 3, 4, 5], 2)) == [[1, 2], [3, 4], [5]]
    assert list(svc._chunked([], 2)) == []


# ==================== _fetch_bucket_sizes_from_cloudwatch ====================


def _make_fake_cloudwatch(metrics_pages, get_metric_data_response):
    """Build a MagicMock CloudWatch client returning canned responses."""
    cloudwatch = MagicMock()
    cloudwatch.get_paginator.return_value.paginate.return_value = metrics_pages
    cloudwatch.get_metric_data.return_value = get_metric_data_response
    return cloudwatch


def _metric(bucket, storage_type):
    return {
        "Dimensions": [
            {"Name": "BucketName", "Value": bucket},
            {"Name": "StorageType", "Value": storage_type},
        ]
    }


def test_fetch_sums_storage_classes_and_filters_foreign_buckets():
    older = datetime(2026, 6, 1, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 3, tzinfo=timezone.utc)
    ts_b = datetime(2026, 6, 2, tzinfo=timezone.utc)

    # ListMetrics discovers two storage classes for workspace-a, one for
    # workspace-b, plus a foreign bucket that must be ignored.
    metrics_pages = [
        {
            "Metrics": [
                _metric("workspace-a", "StandardStorage"),
                _metric("workspace-a", "StandardIAStorage"),
                _metric("workspace-b", "StandardStorage"),
                _metric("not-a-team-bucket", "StandardStorage"),
            ]
        }
    ]
    # metric_pairs order -> m0=workspace-a, m1=workspace-a, m2=workspace-b.
    get_metric_data_response = {
        "MetricDataResults": [
            {"Id": "m0", "Values": [100.0], "Timestamps": [older]},
            {"Id": "m1", "Values": [50.0], "Timestamps": [newer]},
            {"Id": "m2", "Values": [2000.0], "Timestamps": [ts_b]},
        ]
    }
    fake_cw = _make_fake_cloudwatch(metrics_pages, get_metric_data_response)
    fake_session = MagicMock()
    fake_session.region_name = "us-east-1"
    fake_session.client.return_value = fake_cw

    with patch("boto3.Session", return_value=fake_session):
        result = svc._fetch_bucket_sizes_from_cloudwatch({"workspace-a", "workspace-b"})

    # workspace-a sums both storage classes; as_of is the latest contributing point.
    assert result["workspace-a"] == (150, newer)
    assert result["workspace-b"] == (2000, ts_b)
    # Foreign bucket never queried / never returned.
    assert "not-a-team-bucket" not in result


def test_fetch_returns_empty_when_no_target_buckets():
    # Short-circuits before importing boto3.
    assert svc._fetch_bucket_sizes_from_cloudwatch(set()) == {}


def test_fetch_returns_empty_when_no_matching_metrics():
    metrics_pages = [{"Metrics": [_metric("some-other-bucket", "StandardStorage")]}]
    fake_cw = _make_fake_cloudwatch(metrics_pages, {"MetricDataResults": []})
    fake_session = MagicMock()
    fake_session.region_name = "us-east-1"
    fake_session.client.return_value = fake_cw

    with patch("boto3.Session", return_value=fake_session):
        result = svc._fetch_bucket_sizes_from_cloudwatch({"workspace-a"})

    assert result == {}
    fake_cw.get_metric_data.assert_not_called()


# ==================== get_team_storage_usage ====================


def _teams():
    return [
        SimpleNamespace(id="t1", name="Team One"),
        SimpleNamespace(id="t2", name="Team Two"),
    ]


async def test_get_team_storage_usage_aggregates_and_sorts():
    as_of = datetime(2026, 6, 9, tzinfo=timezone.utc)
    # Only t1's bucket has data; t2 should appear with zero / has_data=False.
    sizes = {"workspace-t1": (2000, as_of)}

    with (
        patch.object(svc, "STORAGE_PROVIDER", "aws"),
        patch.object(svc, "get_all_teams", AsyncMock(return_value=_teams())),
        patch.object(svc, "_fetch_bucket_sizes_from_cloudwatch", return_value=sizes),
    ):
        report = await svc.get_team_storage_usage(MagicMock())

    assert report.supported is True
    assert report.total_bytes == 2000
    # Sorted by size desc: the team with data comes first.
    assert [t.team_id for t in report.teams] == ["t1", "t2"]

    t1, t2 = report.teams
    assert (t1.total_bytes, t1.has_data, t1.as_of, t1.bucket_name) == (2000, True, as_of, "workspace-t1")
    assert (t2.total_bytes, t2.has_data, t2.as_of, t2.bucket_name) == (0, False, None, "workspace-t2")


async def test_get_team_storage_usage_unsupported_on_non_aws():
    with (
        patch.object(svc, "STORAGE_PROVIDER", "gcp"),
        patch.object(svc, "get_all_teams", AsyncMock(return_value=_teams())),
    ):
        report = await svc.get_team_storage_usage(MagicMock())

    assert report.supported is False
    assert report.total_bytes == 0
    assert "gcp" in report.message
    # Still returns a row per team, all zeroed.
    assert len(report.teams) == 2
    assert all(t.total_bytes == 0 and t.has_data is False for t in report.teams)
