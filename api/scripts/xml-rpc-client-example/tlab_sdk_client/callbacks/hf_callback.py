from transformers import TrainerCallback


class TLabProgressCallback(TrainerCallback):
    def __init__(self, tlab_client):
        self.tlab_client = tlab_client

    def on_step_end(self, args, state, control, **kwargs):
        if state.is_local_process_zero:
            if state.max_steps > 0:
                # Calculate progress percentage (30-90%)
                progress = 30 + ((state.global_step / state.max_steps) * 60)
                metrics = {
                    "step": state.global_step,
                    "train/loss": state.log_history[-1]["loss"] if state.log_history else None,
                }
                # Report progress to TransformerLab
                if not self.tlab_client.report_progress(progress, metrics):
                    # Job was stopped remotely
                    control.should_training_stop = True

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs and "loss" in logs:
            metrics = {"step": state.global_step, "train/loss": logs["loss"]}
            # Add other metrics if available
            for key, value in logs.items():
                if isinstance(value, (int, float)):
                    metrics[key] = value
            self.tlab_client.report_progress(30 + ((state.global_step / state.max_steps) * 60), metrics)
