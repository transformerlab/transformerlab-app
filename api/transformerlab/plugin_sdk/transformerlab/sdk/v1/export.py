from transformerlab.sdk.v1.tlab_plugin import TLabPlugin, DotDict


class ExportTLabPlugin(TLabPlugin):
    """Enhanced Decorator class for TransformerLab exporter plugins"""

    def __init__(self):
        super().__init__()
        self.tlab_plugin_type = "exporter"

        self._parser.add_argument("--output_dir", default=None, type=str, help="Path to save the exported model")

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

    def job_wrapper(self, progress_start: int = 0, progress_end: int = 100, **kwargs):
        """Use base job_wrapper with exporter defaults: no wandb, export success/error messages."""
        kwargs.setdefault("success_message", "Export completed successfully")
        kwargs.setdefault("include_exception_in_error", True)
        return super().job_wrapper(progress_start=progress_start, progress_end=progress_end, **kwargs)


# Create an instance of the ExportTLabPlugin class
tlab_exporter = ExportTLabPlugin()
