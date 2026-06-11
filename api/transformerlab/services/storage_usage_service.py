"""Per-team object-storage usage via CloudWatch (AWS only).

S3 publishes a daily ``BucketSizeBytes`` metric to CloudWatch for every bucket,
broken down by storage class. Because each team has its own dedicated bucket,
we can read a team's total storage straight from CloudWatch without enumerating
objects. The tradeoff is that this only updates once a day.

Design notes
------------
* This module is a **pure, live read** of CloudWatch. It intentionally does no
  caching and no DB persistence, so callers stay free to decide how to store or
  cache results.
* CloudWatch publishes these storage metrics roughly **once per day** with a
  24-48h lag, so the returned numbers are a recent daily snapshot, **not**
  real-time. There is therefore no value in calling this on every page load —
  the underlying value barely moves intra-day.
* Only meaningful when ``TFL_STORAGE_PROVIDER == "aws"``. For other providers
  the report is returned with ``supported=False`` and zeroed usage.
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from lab.storage import STORAGE_PROVIDER
from transformerlab.db.team import get_all_teams
from transformerlab.shared.remote_workspace import bucket_name_for_team, get_default_aws_profile

logger = logging.getLogger(__name__)

# CloudWatch S3 storage metrics are emitted once per day. Look back a few days
# and take the most recent datapoint to tolerate the normal 24-48h lag.
_LOOKBACK_DAYS = 3
# Daily period — matches how S3 reports BucketSizeBytes.
_METRIC_PERIOD_SECONDS = 86400
# GetMetricData accepts at most 500 metric queries per call.
_MAX_QUERIES_PER_CALL = 500


@dataclass
class TeamStorageUsage:
    """Storage usage for a single team's bucket."""

    team_id: str
    team_name: str
    bucket_name: str
    total_bytes: int
    # Timestamp of the CloudWatch datapoint the size came from (None if no data).
    as_of: Optional[datetime]
    # False when CloudWatch had no datapoint yet (e.g. a brand-new bucket).
    has_data: bool


@dataclass
class StorageUsageReport:
    """A point-in-time view of per-team storage usage across all teams."""

    provider: str
    # False when the configured storage provider is not AWS (CloudWatch-only).
    supported: bool
    # When this report was generated (UTC, timezone-aware). Not the data's age —
    # see each team's `as_of` for that.
    fetched_at: datetime
    teams: List[TeamStorageUsage]
    total_bytes: int
    message: Optional[str] = None


async def get_team_storage_usage(session: AsyncSession) -> StorageUsageReport:
    """Return current per-team storage usage for every team.

    Always returns a row for every team — teams whose bucket has no CloudWatch
    datapoint yet are reported with ``total_bytes=0`` and ``has_data=False``.
    The list is sorted by ``total_bytes`` descending so the biggest consumers
    surface first.

    This performs a live CloudWatch read; callers that serve it to many users
    should cache or snapshot the result rather than calling per request.
    """
    fetched_at = datetime.now(timezone.utc)

    teams = await get_all_teams(session)
    # Map each team's canonical bucket name back to the team.
    bucket_to_team = {bucket_name_for_team(team.id): team for team in teams}

    if STORAGE_PROVIDER != "aws":
        teams_usage = [
            TeamStorageUsage(
                team_id=team.id,
                team_name=team.name,
                bucket_name=bucket,
                total_bytes=0,
                as_of=None,
                has_data=False,
            )
            for bucket, team in bucket_to_team.items()
        ]
        return StorageUsageReport(
            provider=STORAGE_PROVIDER,
            supported=False,
            fetched_at=fetched_at,
            teams=teams_usage,
            total_bytes=0,
            message=(
                "Storage usage reporting via CloudWatch is only available on AWS "
                f"(TFL_STORAGE_PROVIDER={STORAGE_PROVIDER!r})."
            ),
        )

    # boto3 calls are blocking; keep the event loop free.
    sizes = await asyncio.to_thread(_fetch_bucket_sizes_from_cloudwatch, set(bucket_to_team.keys()))

    teams_usage = []
    total_bytes = 0
    for bucket, team in bucket_to_team.items():
        if bucket in sizes:
            size_bytes, as_of = sizes[bucket]
            teams_usage.append(
                TeamStorageUsage(
                    team_id=team.id,
                    team_name=team.name,
                    bucket_name=bucket,
                    total_bytes=size_bytes,
                    as_of=as_of,
                    has_data=True,
                )
            )
            total_bytes += size_bytes
        else:
            teams_usage.append(
                TeamStorageUsage(
                    team_id=team.id,
                    team_name=team.name,
                    bucket_name=bucket,
                    total_bytes=0,
                    as_of=None,
                    has_data=False,
                )
            )

    teams_usage.sort(key=lambda usage: usage.total_bytes, reverse=True)

    return StorageUsageReport(
        provider="aws",
        supported=True,
        fetched_at=fetched_at,
        teams=teams_usage,
        total_bytes=total_bytes,
    )


def _fetch_bucket_sizes_from_cloudwatch(target_buckets: Set[str]) -> Dict[str, Tuple[int, Optional[datetime]]]:
    """Read the latest ``BucketSizeBytes`` for each target bucket from CloudWatch.

    Returns a mapping ``bucket_name -> (total_bytes, as_of)`` where ``total_bytes``
    is summed across all storage classes for that bucket and ``as_of`` is the
    timestamp of the latest contributing datapoint. Buckets with no data are
    simply absent from the returned mapping. Best-effort: on any AWS error this
    logs and returns whatever it has gathered so far (possibly empty).

    Blocking (uses boto3) — call via ``asyncio.to_thread``.
    """
    if not target_buckets:
        return {}

    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError
    except ImportError:
        logger.warning("boto3 is not installed; cannot read storage usage from CloudWatch")
        return {}

    profile_name = get_default_aws_profile()
    try:
        boto_session = boto3.Session(profile_name=profile_name)
    except Exception:
        # Fall back to the default credential chain (mirrors remote_workspace).
        boto_session = boto3.Session()
    region = boto_session.region_name or os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    cloudwatch = boto_session.client("cloudwatch", region_name=region)

    # 1. Discover the (bucket, storage_type) pairs that actually have data, so we
    #    don't have to guess storage classes or query empty buckets.
    metric_pairs: List[Tuple[str, str]] = []
    try:
        paginator = cloudwatch.get_paginator("list_metrics")
        for page in paginator.paginate(Namespace="AWS/S3", MetricName="BucketSizeBytes"):
            for metric in page.get("Metrics", []):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                bucket = dims.get("BucketName")
                storage_type = dims.get("StorageType")
                if bucket in target_buckets and storage_type:
                    metric_pairs.append((bucket, storage_type))
    except (ClientError, BotoCoreError) as exc:
        logger.warning("CloudWatch list_metrics failed: %s", exc)
        return {}

    if not metric_pairs:
        return {}

    # 2. Pull the latest daily datapoint for each pair and sum per bucket.
    start_time = datetime.now(timezone.utc) - timedelta(days=_LOOKBACK_DAYS)
    end_time = datetime.now(timezone.utc)

    # bucket -> [running_total_bytes, latest_timestamp]
    accumulator: Dict[str, List] = {}

    for batch in _chunked(metric_pairs, _MAX_QUERIES_PER_CALL):
        queries = []
        id_to_bucket: Dict[str, str] = {}
        for index, (bucket, storage_type) in enumerate(batch):
            query_id = f"m{index}"
            id_to_bucket[query_id] = bucket
            queries.append(
                {
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/S3",
                            "MetricName": "BucketSizeBytes",
                            "Dimensions": [
                                {"Name": "BucketName", "Value": bucket},
                                {"Name": "StorageType", "Value": storage_type},
                            ],
                        },
                        "Period": _METRIC_PERIOD_SECONDS,
                        "Stat": "Average",
                    },
                    "ReturnData": True,
                }
            )

        next_token: Optional[str] = None
        while True:
            kwargs = {
                "MetricDataQueries": queries,
                "StartTime": start_time,
                "EndTime": end_time,
                "ScanBy": "TimestampDescending",
            }
            if next_token:
                kwargs["NextToken"] = next_token
            try:
                response = cloudwatch.get_metric_data(**kwargs)
            except (ClientError, BotoCoreError) as exc:
                logger.warning("CloudWatch get_metric_data failed: %s", exc)
                break

            for result in response.get("MetricDataResults", []):
                values = result.get("Values", [])
                if not values:
                    continue
                bucket = id_to_bucket.get(result.get("Id", ""))
                if bucket is None:
                    continue
                timestamps = result.get("Timestamps", [])
                # ScanBy=TimestampDescending => index 0 is the most recent point.
                latest_value = values[0]
                latest_ts = timestamps[0] if timestamps else None

                entry = accumulator.setdefault(bucket, [0.0, None])
                entry[0] += latest_value
                if latest_ts is not None and (entry[1] is None or latest_ts > entry[1]):
                    entry[1] = latest_ts

            next_token = response.get("NextToken")
            if not next_token:
                break

    return {bucket: (int(round(total)), as_of) for bucket, (total, as_of) in accumulator.items()}


def _chunked(items: List, size: int):
    """Yield successive ``size``-length chunks from ``items``."""
    for start in range(0, len(items), size):
        yield items[start : start + size]


def human_readable_bytes(num_bytes: int) -> str:
    """Format a byte count as a human-readable string (e.g. ``'1.5 GB'``)."""
    value = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if abs(value) < 1024.0 or unit == "PB":
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024.0
    return f"{value:.1f} PB"
