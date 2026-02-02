from transformerlab.sdk.v1.tlab_plugin import TLabPlugin, _run_async_from_sync

# Re-export so diffusion plugins can run lab async APIs from sync code (e.g. inside async_job_wrapper)
run_async_from_sync = _run_async_from_sync


class DiffusionTLabPlugin(TLabPlugin):
    """Enhanced decorator class for TransformerLab diffusion plugins"""

    def __init__(self):
        super().__init__()
        self._parser.add_argument("--run_name", default="diffused", type=str, help="Name for the diffusion output")
        self._parser.add_argument("--experiment_name", default="default", type=str, help="Name of the experiment")
        self._parser.add_argument("--diffusion_model", default="local", type=str, help="Diffusion model to use")
        self._parser.add_argument("--model", type=str, default="")

        self.tlab_plugin_type = "diffusion"

    def _ensure_args_parsed(self):
        if not self._args_parsed:
            args, unknown_args = self._parser.parse_known_args()
            for key, value in vars(args).items():
                self.params[key] = value
            self._parse_unknown_args(unknown_args)
            self._args_parsed = True

    def _parse_unknown_args(self, unknown_args):
        key = None
        for arg in unknown_args:
            if arg.startswith("--"):
                key = arg.lstrip("-")
                self.params[key] = True
            elif key:
                self.params[key] = arg
                key = None


# Global instance (like tlab_gen in generate.py)
tlab_diffusion = DiffusionTLabPlugin()
