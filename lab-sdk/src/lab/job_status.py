from enum import Enum


class JobStatus(str, Enum):
    """Canonical job status enum.

    All job status transitions should use these values. Because ``JobStatus``
    inherits from ``str``, comparisons with plain strings work transparently
    (e.g. ``status == JobStatus.RUNNING`` is ``True`` when ``status == "RUNNING"``).
    """

    NOT_STARTED = "NOT_STARTED"
    QUEUED = "QUEUED"
    WAITING = "WAITING"
    LAUNCHING = "LAUNCHING"
    INTERACTIVE = "INTERACTIVE"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"
    COMPLETE = "COMPLETE"
    STOPPED = "STOPPED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    DELETED = "DELETED"
    UNAUTHORIZED = "UNAUTHORIZED"
    CREATED = "CREATED"
    STARTED = "STARTED"


# Terminal states: once a job enters one of these it should not transition further.
TERMINAL_STATUSES = frozenset(
    {
        JobStatus.COMPLETE,
        JobStatus.STOPPED,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
        JobStatus.DELETED,
        JobStatus.UNAUTHORIZED,
    }
)
