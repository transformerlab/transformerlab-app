"""Datetime helpers for working with DB columns.

Our SQLAlchemy ``DateTime`` columns are declared without ``timezone=True``
(naive datetimes), but we want their values to represent UTC regardless of the
server's local timezone. This module centralises the conversion so callers do
not have to remember the three rules below:

1. Avoid ``datetime.now()`` -- that returns local time.
2. Avoid ``datetime.utcnow()`` -- it is deprecated in Python 3.12+.
3. Use ``datetime.now(timezone.utc)`` then ``.replace(tzinfo=None)`` so the
   result fits a naive ``DateTime`` column.

Always use :func:`utc_now_naive` when assigning to (or comparing against) a
``DateTime`` column.
"""

from datetime import datetime, timezone


def utc_now_naive() -> datetime:
    """Return the current UTC time as a naive ``datetime``.

    Use this for any value that will be written to a SQLAlchemy ``DateTime``
    column (without ``timezone=True``) or compared against one. The returned
    value is tz-naive but represents UTC.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_naive(value: datetime) -> datetime:
    """Convert a datetime to naive UTC for storage in a ``DateTime`` column.

    Use when persisting an externally-sourced datetime (e.g. a timestamp from an
    AWS API) into a naive ``DateTime`` column. Aware datetimes are converted to
    UTC and stripped of tzinfo; naive datetimes are assumed to already represent
    UTC and returned unchanged.
    """
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value
