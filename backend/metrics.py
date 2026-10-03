"""Lightweight in-process metrics for the admin health dashboard."""
import time

START = time.time()
_ERRORS = {"count": 0}


def uptime_seconds() -> int:
    return int(time.time() - START)


def record_error() -> None:
    _ERRORS["count"] += 1


def error_count() -> int:
    return _ERRORS["count"]
