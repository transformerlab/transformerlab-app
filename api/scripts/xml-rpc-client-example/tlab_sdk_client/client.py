import json
import logging
import os
import sys
import time
import xmlrpc.client
from datetime import datetime
from logging.handlers import RotatingFileHandler


class TransformerLabClient:
    """Client for reporting training progress to TransformerLab via XML-RPC"""

    def __init__(
        self,
        server_url: str = "http://localhost:8338",
        sdk_version: str = "v1",
        log_file: str = None,
    ):
        """Initialize the XML-RPC client"""
        server_url = server_url.rstrip("/") + f"/client/{sdk_version}/jobs"
        if not server_url.startswith("http") and not server_url.startswith("https"):
            raise ValueError("Invalid server URL. Must start with http:// or https://")
        self.server = xmlrpc.client.ServerProxy(server_url)
        self.job_id = None
        self.config = {}
        self.last_report_time = 0
        self.report_interval = 1  # seconds
        self.log_file = log_file

    def start(self, config):
        """Register job with TransformerLab and get a job ID"""
        result = self.server.start_training(json.dumps(config))
        if result["status"] == "started":
            self.job_id = result["job_id"]
            self.config = config
            # Set up logger
            self.create_logger(log_file=self.log_file)
            self.log_info(f"Registered job with TransformerLab. Job ID: {self.job_id}")
            return self.job_id
        else:
            error_msg = f"Failed to start job: {result['message']}"
            raise Exception(error_msg)

    def report_progress(self, progress, metrics=None):
        """Report training progress to TransformerLab"""
        if not self.job_id:
            return True

        # Rate limit reports
        current_time = time.time()
        if current_time - self.last_report_time < self.report_interval:
            return True

        self.last_report_time = current_time

        try:
            status = self.server.get_training_status(self.job_id, int(progress))

            # If metrics are important, consider logging them separately
            if metrics and hasattr(self.server, "log_metrics"):
                self.server.log_metrics(self.job_id, json.dumps(metrics))

            if status.get("status") == "stopped":
                self.log_info("Job was stopped remotely. Terminating training...")
                sys.exit(1)
                return False
            return True
        except Exception as e:
            print(f"Error reporting progress: {e}")
            # Still return True to continue training despite reporting error
            return True

    def complete(self, message="Training completed successfully"):
        """Mark job as complete in TransformerLab"""
        if not self.job_id:
            return

        try:
            # Use the dedicated complete_job method if it exists
            if hasattr(self.server, "complete_job"):
                self.server.complete_job(self.job_id, "COMPLETE", message)
            else:
                # Fall back to using get_training_status with 100% progress
                self.report_progress(100)
                self.server.get_training_status(self.job_id, 100)
        except Exception as e:
            self.log_error(f"Error completing job: {e}")

    def stop(self, message="Training completed successfully"):
        """Mark job as complete in TransformerLab"""
        if not self.job_id:
            return

        try:
            # Use the dedicated complete_job method if it exists
            if hasattr(self.server, "complete_job"):
                self.server.complete_job(self.job_id, "STOPPED", message)
            else:
                # Fall back to using get_training_status with 100% progress
                self.report_progress(100)
                self.server.get_training_status(self.job_id, 100)
        except Exception as e:
            self.log_error(f"Error completing job: {e}")

    def save_model(self, saved_model_path: str):
        """Save the model to the specified path"""
        if not self.job_id:
            return

        try:
            # Use the dedicated save_model method if it exists
            if hasattr(self.server, "save_model"):
                self.server.save_model(self.job_id, os.path.abspath(saved_model_path))
            else:
                self.log_warning("save_model method not available in server.")
        except Exception as e:
            print(f"Error saving model: {e}")

    def update_output_file_in_tlab(self):
        try:
            if hasattr(self.server, "update_output_file"):
                # Use the dedicated update_output_file method if it exists
                self.server.update_output_file(self.job_id, os.path.abspath(self.log_file_path))
            else:
                print("There was an issue with updating output.txt within Transformer Lab app.")
        except Exception as e:
            print(f"There was an issue with updating output.txt within Transformer Lab app: {e!s}")
            raise e

    def create_logger(self, log_file=None, level=logging.INFO):
        """Initialize logger with both file and console output"""
        # Create logger
        self.logger = logging.getLogger("transformerlab")
        self.logger.setLevel(level)
        self.logger.handlers = []  # Clear any existing handlers

        # Create formatter
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

        # If no log file specified, create one with timestamp
        if not log_file:
            os.makedirs("logs", exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = f"logs/transformerlab_training_{timestamp}.log"

        self.log_file_path = log_file

        # Create file handler
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
        )
        file_handler.setFormatter(formatter)
        self.logger.addHandler(file_handler)

        # Create console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)

        self.log_file = log_file
        self.log_info(f"Logging to file: {log_file}")

    def log_info(self, message):
        """Log info message"""
        self.logger.info(message)
        self.update_output_file_in_tlab()

    def log_error(self, message):
        """Log error message"""
        self.logger.error(message)
        self.update_output_file_in_tlab()

    def log_warning(self, message):
        """Log warning message"""
        self.logger.warning(message)
        self.update_output_file_in_tlab()

    def log_debug(self, message):
        """Log debug message"""
        self.logger.debug(message)
        self.update_output_file_in_tlab()

    def log_critical(self, message):
        """Log critical message"""
        self.logger.critical(message)
        self.update_output_file_in_tlab()
