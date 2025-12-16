import logging
import sys
import json

try:
    import newrelic.agent

    HAS_NEWRELIC = True
except ImportError:
    HAS_NEWRELIC = False


class JSONFormatter(logging.Formatter):
    def __init__(self, service_name):
        super().__init__()
        self.service_name = service_name

    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "service": self.service_name,
            "logger": record.name,
        }

        if HAS_NEWRELIC:
            log_record.update(newrelic.agent.get_linking_metadata())

        if hasattr(record, "tags"):
            log_record.update(record.tags)

        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_record)


def setup_logging(service_name="transformerlab-api"):
    """
    Replaces the default handler with our JSON handler.
    Call this once at app startup.
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    if root_logger.handlers:
        for handler in root_logger.handlers:
            root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter(service_name))
    root_logger.addHandler(handler)

    # Silence noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


class LogServiceWrapper:
    """
    Wraps standard python logging so we can pass arbitrary kwargs
    and have them automatically put into the 'tags' dictionary
    for the JSONFormatter.
    """

    def __init__(self, name="transformerlab"):
        self.logger = logging.getLogger(name)

    def info(self, message: str, **kwargs):
        # Takes kwargs and puts them into extra={"tags": ...}
        self.logger.info(message, extra={"tags": kwargs})

    def warning(self, message: str, **kwargs):
        self.logger.warning(message, extra={"tags": kwargs})

    def error(self, message: str, exc: Exception = None, **kwargs):
        self.logger.error(message, exc_info=exc, extra={"tags": kwargs})


log_service = LogServiceWrapper()
