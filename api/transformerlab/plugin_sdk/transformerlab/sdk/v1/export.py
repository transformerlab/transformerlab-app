import time
import traceback

from transformerlab.sdk.v1.tlab_plugin import DotDict, TLabPlugin


class ExportTLabPlugin(TLabPlugin):
    """Enhanced Decorator class for TransformerLab exporter plugins"""

    def __init__(self):
        super().__init__()
        self.tlab_plugin_type = "exporter"

        self._parser.add_argument(
            "--output_dir", default=None, type=str, help="Path to save the exported model"
        )

    def _ensure_args_parsed(self):
        """Ensure arguments are parsed and convert self.params to a DotDict"""
        if not self._args_parsed:
            args, unknown_args = self._parser.parse_known_args()

            # Transfer all known arguments to attributes of self
            for key, value in vars(args).items():
                self.params[key] = value

            self._parse_unknown_args(unknown_args)
            self._args_parsed = True

        if not isinstance(self.params, DotDict):
            self.params = DotDict(self.params)

    def _parse_unknown_args(self, unknown_args):
        """Parse unknown arguments which change with each export job"""
        key = None
        for arg in unknown_args:
            if arg.startswith("--"):  # Argument key
                key = arg.lstrip("-")
                self.params[key] = True
            elif key:  # Argument value
                self.params[key] = arg
                key = None

    # Added exporter-specific functionality and removed wandb logging
    def exporter_job_wrapper(self, progress_start: int = 0, progress_end: int = 100):
        """Decorator for wrapping an exporter function with job status updates"""

        def decorator(func):
            def wrapper(*args, **kwargs):
                # Ensure args are parsed and job is initialized
                self._ensure_args_parsed()
                start_time = time.strftime("%Y-%m-%d %H:%M:%S")
                self.add_job_data("start_time", start_time)
                self.add_job_data("model_name", self.params.model_name)

                # Update starting progress
                self.job.update_progress(progress_start)

                try:
                    # Call the wrapped function
                    result = func(*args, **kwargs)

                    # Update final progress and success status
                    self.job.update_progress(progress_end)
                    self.job.update_job_data_field("completion_status", "success")
                    self.job.update_job_data_field(
                        "completion_details", "Export completed successfully"
                    )
                    self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))

                    return result

                except Exception as e:
                    # Capture the full erorr
                    error_msg = f"Error in Job: {e!s}\n{traceback.format_exc()}"
                    print(error_msg)

                    # Log the error
                    self.job.update_job_data_field("completion_status", "failed")
                    self.job.update_job_data_field("completion_details", f"Error occured: {e!s}")
                    self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))

                    raise

            return wrapper

        return decorator


# Create an instance of the ExportTLabPlugin class
tlab_exporter = ExportTLabPlugin()
