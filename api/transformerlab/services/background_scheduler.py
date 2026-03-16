import asyncio
from typing import Awaitable, Callable


async def run_periodic_worker(
    name: str,
    interval_seconds: int,
    cycle_fn: Callable[[], Awaitable[None]],
) -> None:
    """Generic periodic worker loop.

    Runs ``cycle_fn`` in an infinite loop with a fixed sleep between iterations,
    logging unhandled errors but keeping the worker alive until cancelled.
    """
    print(f"{name}: started")
    try:
        while True:
            try:
                await cycle_fn()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                print(f"{name}: unhandled error in cycle, continuing: {exc}")
            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        print(f"{name}: stopping")
        raise


async def run_combined_workers_loop(
    workers: list[tuple[str, int, Callable[[], Awaitable[None]]]],
) -> None:
    """Run multiple worker cycles in a single orchestrated loop.

    Each worker is defined by (name, interval_seconds, cycle_fn). The orchestrator
    tracks independent schedules for each worker and invokes their cycle functions
    when due, while handling errors per-cycle so a failure in one worker does not
    block the others.
    """
    now = asyncio.get_event_loop().time()
    next_runs = {name: now for name, _interval, _fn in workers}

    for name, _interval, _fn in workers:
        print(f"{name}: orchestrated worker registered")

    try:
        while True:
            now = asyncio.get_event_loop().time()

            for name, interval, cycle_fn in workers:
                if now >= next_runs[name]:
                    try:
                        await cycle_fn()
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:
                        print(f"{name}: unhandled error in orchestrator cycle, continuing: {exc}")
                    next_runs[name] = now + interval

            sleep_until = min(next_runs.values())
            delay = max(0.0, sleep_until - asyncio.get_event_loop().time())
            await asyncio.sleep(delay)
    except asyncio.CancelledError:
        for name, _interval, _fn in workers:
            print(f"{name}: orchestrated worker stopping")
        raise
