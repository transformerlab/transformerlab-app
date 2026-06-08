"""Build and render the per-experiment job runs chart as a PNG.

This mirrors the frontend chart in
``src/renderer/components/Experiment/Tasks/JobsChartShared.ts`` /
``JobsChartGraphView.tsx``: each job run is plotted as a point (metric score
over time), best-so-far runs are highlighted, discarded runs are grayed out,
and a step line traces the best score over time.
"""

import io
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

import transformerlab.services.job_service as job_service

logger = logging.getLogger(__name__)

# Colors mirror JobsChartGraphView.tsx
_BEST_COLOR = "#22c55e"
_BEST_BORDER = "#15803d"
_POINT_COLOR = "#3b82f6"
_DISCARD_POINT_FILL = "#94a3b8"
_DISCARD_POINT_STROKE = "#64748b"
_GRID_COLOR = "#e2e8f0"
_AXIS_TEXT_COLOR = "#475569"


class ChartDataError(ValueError):
    """Raised when an experiment has no chartable job data."""


class MetricNotFoundError(ValueError):
    """Raised when an explicitly requested metric is missing from all jobs."""


@dataclass
class ChartPoint:
    x: datetime
    y: float
    job_id: str
    discarded: bool
    is_best: bool = False


@dataclass
class GraphModel:
    points: List[ChartPoint]
    best_for_step_line: List[ChartPoint]
    primary_metric: Optional[str]
    axis_legend: str


def _parse_discard_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value == 1
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized == "true":
            return True
        if normalized == "false":
            return False
        try:
            return int(normalized) == 1
        except ValueError:
            return False
    return False


def _parse_numeric_score_fields(score: Any) -> Dict[str, float]:
    """Extract numeric metric fields from a job's score payload."""
    if isinstance(score, bool):
        return {}
    if isinstance(score, (int, float)):
        return {"score": float(score)}
    if isinstance(score, str):
        try:
            return {"score": float(score)}
        except ValueError:
            return {}
    if isinstance(score, dict):
        fields: Dict[str, float] = {}
        for key, value in score.items():
            if key.lower() == "discard":
                continue
            if isinstance(value, bool):
                continue
            try:
                fields[key] = float(value)
            except (TypeError, ValueError):
                continue
        return fields
    return {}


def compute_primary_metric_key(jobs: List[dict]) -> Optional[str]:
    """Auto-detect the primary metric: prefer a key named 'score', else the first key."""
    for job in jobs:
        fields = _parse_numeric_score_fields((job.get("job_data") or {}).get("score"))
        keys = list(fields.keys())
        if keys:
            return next((k for k in keys if k.lower() == "score"), keys[0])
    return None


def resolve_lower_is_better(jobs: List[dict]) -> bool:
    """Majority vote over job_data.lower_is_better; defaults to False."""
    true_count = 0
    false_count = 0
    for job in jobs:
        value = (job.get("job_data") or {}).get("lower_is_better")
        if value is True:
            true_count += 1
        elif value is False:
            false_count += 1
    if true_count == 0 and false_count == 0:
        return False
    return true_count > false_count


def _extract_date(job: dict) -> Optional[datetime]:
    job_data = job.get("job_data") or {}
    raw = job.get("created_at") or job_data.get("start_time") or job_data.get("end_time")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None


def build_graph_model(
    jobs: List[dict],
    metric_key: Optional[str] = None,
    lower_is_better: Optional[bool] = None,
) -> GraphModel:
    """Port of buildGraphModel() from JobsChartShared.ts."""
    primary_metric = metric_key or compute_primary_metric_key(jobs)
    if lower_is_better is None:
        lower_is_better = resolve_lower_is_better(jobs)
    axis_legend = f"Score ({primary_metric})" if primary_metric else "Score"

    points: List[ChartPoint] = []
    for job in jobs:
        date = _extract_date(job)
        if date is None:
            continue
        job_data = job.get("job_data") or {}
        score = job_data.get("score")
        fields = _parse_numeric_score_fields(score)
        if not primary_metric or primary_metric not in fields:
            continue
        score_obj = score if isinstance(score, dict) else {}
        discarded = _parse_discard_value(score_obj.get("discard")) or _parse_discard_value(job_data.get("discard"))
        points.append(
            ChartPoint(
                x=date,
                y=fields[primary_metric],
                job_id=str(job.get("id") or ""),
                discarded=discarded,
            )
        )
    points.sort(key=lambda p: p.x)

    running_extreme = float("inf") if lower_is_better else float("-inf")
    for point in points:
        if point.discarded:
            continue
        better = point.y < running_extreme if lower_is_better else point.y > running_extreme
        if better:
            running_extreme = point.y
            point.is_best = True
    best_for_step_line = [p for p in points if not p.discarded and p.is_best]

    return GraphModel(
        points=points,
        best_for_step_line=best_for_step_line,
        primary_metric=primary_metric,
        axis_legend=axis_legend,
    )


def render_chart_png(model: GraphModel) -> bytes:
    """Render a GraphModel to PNG bytes with matplotlib (headless)."""
    # Imported lazily so that importing this service (and the jobs router)
    # doesn't pay the matplotlib startup cost on every API boot.
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(12, 6), dpi=100)
    try:
        scored = [p for p in model.points if not p.discarded and not p.is_best]
        best = [p for p in model.points if not p.discarded and p.is_best]
        discarded = [p for p in model.points if p.discarded]

        if len(model.best_for_step_line) >= 2:
            ax.plot(
                [p.x for p in model.best_for_step_line],
                [p.y for p in model.best_for_step_line],
                drawstyle="steps-post",
                color=_BEST_COLOR,
                linewidth=2,
                zorder=1,
                label="Best so far",
            )
        if discarded:
            ax.scatter(
                [p.x for p in discarded],
                [p.y for p in discarded],
                s=50,
                color=_DISCARD_POINT_FILL,
                edgecolors=_DISCARD_POINT_STROKE,
                linewidths=1.5,
                zorder=2,
                label="Discarded",
            )
        if scored:
            ax.scatter(
                [p.x for p in scored],
                [p.y for p in scored],
                s=40,
                color=_POINT_COLOR,
                zorder=3,
                label="Scored",
            )
        if best:
            ax.scatter(
                [p.x for p in best],
                [p.y for p in best],
                s=60,
                color=_BEST_COLOR,
                edgecolors=_BEST_BORDER,
                linewidths=1,
                zorder=4,
                label="Best run",
            )

        ax.set_xlabel("Date", color=_AXIS_TEXT_COLOR)
        ax.set_ylabel(model.axis_legend, color=_AXIS_TEXT_COLOR)
        ax.grid(axis="y", color=_GRID_COLOR, linewidth=1)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d %H:%M"))
        ax.tick_params(colors=_AXIS_TEXT_COLOR)
        fig.autofmt_xdate(rotation=30)
        ax.set_title("Job Runs", color=_AXIS_TEXT_COLOR)
        ax.legend(loc="best", fontsize=9)
        fig.tight_layout()

        buffer = io.BytesIO()
        fig.savefig(buffer, format="png")
        return buffer.getvalue()
    finally:
        plt.close(fig)


async def generate_experiment_chart_png(
    experiment_id: str,
    metric: Optional[str] = None,
    lower_is_better: Optional[bool] = None,
) -> bytes:
    """Fetch an experiment's REMOTE jobs and render the job runs chart as PNG bytes."""
    jobs = await job_service.jobs_get_all(experiment_id=experiment_id, type="REMOTE", status="")

    if metric:
        has_metric = any(
            metric in _parse_numeric_score_fields((job.get("job_data") or {}).get("score")) for job in jobs
        )
        if not has_metric:
            raise MetricNotFoundError(f"Metric '{metric}' not found in any job scores for experiment {experiment_id}.")

    model = build_graph_model(jobs, metric_key=metric, lower_is_better=lower_is_better)
    if not model.points:
        raise ChartDataError(f"No scored jobs to chart for experiment {experiment_id}.")

    return render_chart_png(model)
