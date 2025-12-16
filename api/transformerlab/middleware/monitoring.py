# transformerlab/middleware/monitoring.py
import time
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
import logging

# Check for New Relic Agent
try:
    import newrelic.agent
except ImportError:
    newrelic = None

logger = logging.getLogger("transformerlab.middleware")


class MonitoringMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # 1. Start a New Relic Transaction if not auto-instrumented
        if newrelic:
            newrelic.agent.add_custom_parameter("request.url", str(request.url))
            newrelic.agent.add_custom_parameter("request.method", request.method)

        response = await call_next(request)

        process_time = (time.time() - start_time) * 1000

        # 2. Log structured data (CloudWatch + New Relic Logs)
        logger.info(
            f"Completed {request.method} {request.url.path}",
            extra={
                "tags": {
                    "http.status": response.status_code,
                    "http.method": request.method,
                    "http.url": request.url.path,
                    "duration_ms": round(process_time, 2),
                }
            },
        )

        return response
