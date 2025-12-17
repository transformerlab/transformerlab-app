import os
from datetime import datetime
from time import sleep

from lab import lab


def train():
    """Fake training function that runs locally but reports to TransformerLab.

    This version uses lab.get_config() to read parameters from the task configuration,
    which can be set via the UI when creating/launching the task.
    """

    try:
        # Initialize lab (auto-loads parameters from job_data if available)
        lab.init()

        # Get parameters from task configuration (set via UI)
        # These parameters are accessible via lab.get_config() after lab.init()
        config = lab.get_config()

        # Extract parameters with defaults
        # All these can be set in the UI when creating/launching the task
        model_name = config.get("model_name", "HuggingFaceTB/SmolLM-135M-Instruct")
        dataset = config.get("dataset", "Trelis/touch-rugby-rules")
        output_dir = config.get("output_dir", "./output")
        num_iterations = config.get("num_iterations", 8)
        learning_rate = config.get("learning_rate", 2e-5)
        batch_size = config.get("batch_size", 8)
        num_train_epochs = config.get("num_train_epochs", 1)
        gradient_accumulation_steps = config.get("gradient_accumulation_steps", 1)
        warmup_ratio = config.get("warmup_ratio", 0.03)
        weight_decay = config.get("weight_decay", 0.01)
        max_seq_length = config.get("max_seq_length", 512)
        log_to_wandb = config.get("log_to_wandb", True)

        # Build training config for logging and wandb
        training_config = {
            "experiment_name": lab.experiment.id,
            "model_name": model_name,
            "dataset": dataset,
            "template_name": "fake-train-with-params",
            "output_dir": output_dir,
            "log_to_wandb": log_to_wandb,
            "_config": {
                "dataset_name": dataset,
                "lr": learning_rate,
                "num_train_epochs": num_train_epochs,
                "batch_size": batch_size,
                "gradient_accumulation_steps": gradient_accumulation_steps,
                "warmup_ratio": warmup_ratio,
                "weight_decay": weight_decay,
                "max_seq_length": max_seq_length,
            },
        }

        # Store the full config in job_data for reference
        lab.set_config(training_config)

        # Log start time and configuration
        start_time = datetime.now()
        lab.log(f"Training started at {start_time}")
        lab.log(f"Model: {model_name}")
        lab.log(f"Dataset: {dataset}")
        lab.log(f"Learning rate: {learning_rate}")
        lab.log(f"Batch size: {batch_size}")
        lab.log(f"Number of iterations: {num_iterations}")

        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)

        # Load the dataset
        lab.log("Loading dataset...")
        sleep(0.1)
        lab.log("Loaded dataset")

        # Report initial progress
        lab.update_progress(10)

        # Train the model
        lab.log("Starting training...")
        print("Starting training")
        for i in range(num_iterations):
            sleep(1)
            lab.log(f"Iteration {i + 1}/{num_iterations}")
            lab.update_progress(10 + (i + 1) * (80 // num_iterations))
            print(f"Iteration {i + 1}/{num_iterations}")

            # Save fake checkpoint every 2 iterations
            if (i + 1) % 2 == 0:
                checkpoint_file = os.path.join(output_dir, f"checkpoint_epoch_{i + 1}.txt")
                with open(checkpoint_file, "w") as f:
                    f.write(f"Fake checkpoint for epoch {i + 1}\n")
                    f.write(f"Model state: iteration_{i + 1}\n")
                    f.write(f"Loss: {0.5 - (i + 1) * 0.05:.3f}\n")
                    f.write(f"Accuracy: {0.6 + (i + 1) * 0.04:.3f}\n")
                    f.write(f"Timestamp: {datetime.now()}\n")

                # Save checkpoint using lab facade
                saved_checkpoint_path = lab.save_checkpoint(checkpoint_file, f"epoch_{i + 1}_checkpoint.txt")
                lab.log(f"Saved checkpoint: {saved_checkpoint_path}")

                # Save some fake artifacts
                artifact_file = os.path.join(
                    output_dir,
                    f"training_metrics_epoch_{i + 1}.json",
                )
                with open(artifact_file, "w") as f:
                    f.write("{\n")
                    f.write(f'  "epoch": {i + 1},\n')
                    f.write(f'  "loss": {0.5 - (i + 1) * 0.05:.3f},\n')
                    f.write(f'  "accuracy": {0.6 + (i + 1) * 0.04:.3f},\n')
                    f.write(f'  "learning_rate": {learning_rate},\n')
                    f.write(f'  "batch_size": {batch_size},\n')
                    f.write(f'  "timestamp": "{datetime.now().isoformat()}"\n')
                    f.write("}\n")

                # Save artifact using lab facade
                saved_artifact_path = lab.save_artifact(artifact_file, f"metrics_epoch_{i + 1}.json")
                lab.log(f"Saved artifact: {saved_artifact_path}")

            if i == 3 and log_to_wandb:  # Initialize wandb halfway through training
                try:
                    import wandb

                    if wandb.run is None:
                        lab.log("🚀 Initializing wandb during training...")
                        wandb.init(
                            project="transformerlab-test",
                            name=f"test-run-{lab.job.id}",
                            config=training_config["_config"],
                        )
                        lab.log("✅ Wandb initialized - URL should be auto-detected on next progress update!")
                except ImportError:
                    lab.log("⚠️  Wandb not available")
                except Exception as e:
                    lab.log(f"⚠️  Error with wandb initialization: {e}")

            # Log metrics to wandb if available
            if log_to_wandb:
                try:
                    import wandb

                    if wandb.run is not None:
                        # Simulate training metrics
                        fake_loss = 0.5 - (i + 1) * 0.05
                        fake_accuracy = 0.6 + (i + 1) * 0.04

                        wandb.log(
                            {
                                "train/loss": fake_loss,
                                "train/accuracy": fake_accuracy,
                                "epoch": i + 1,
                            }
                        )

                        lab.log(f"📈 Logged metrics to wandb: loss={fake_loss:.3f}, accuracy={fake_accuracy:.3f}")
                except Exception:
                    pass

        # Calculate training time
        end_time = datetime.now()
        training_duration = end_time - start_time
        lab.log(f"Training completed in {training_duration}")

        # Save final artifacts
        final_model_file = os.path.join(output_dir, "final_model_summary.txt")
        with open(final_model_file, "w") as f:
            f.write("Final Model Summary\n")
            f.write("==================\n")
            f.write(f"Training Duration: {training_duration}\n")
            f.write("Final Loss: 0.15\n")
            f.write("Final Accuracy: 0.92\n")
            f.write(f"Model: {model_name}\n")
            f.write(f"Dataset: {dataset}\n")
            f.write(f"Completed at: {end_time}\n")

        # Save final model as artifact
        final_model_path = lab.save_artifact(final_model_file, "final_model_summary.txt")
        lab.log(f"Saved final model summary: {final_model_path}")

        # Save training configuration as artifact
        config_file = os.path.join(output_dir, "training_config.json")
        import json

        with open(config_file, "w") as f:
            json.dump(training_config, f, indent=2)

        config_artifact_path = lab.save_artifact(config_file, "training_config.json")
        lab.log(f"Saved training config: {config_artifact_path}")

        # Get the captured wandb URL from job data for reporting
        job_data = lab.job.get_job_data()
        captured_wandb_url = job_data.get("wandb_run_url", "None")
        lab.log(f"📋 Final wandb URL stored in job data: {captured_wandb_url}")

        # Finish wandb run if it was initialized
        if log_to_wandb:
            try:
                import wandb

                if wandb.run is not None:
                    wandb.finish()
                    lab.log("✅ Wandb run finished")
            except Exception:
                pass

        # Save the trained model
        model_dir = os.path.join(output_dir, "final_model")
        os.makedirs(model_dir, exist_ok=True)

        # Create dummy model files to simulate a saved model
        with open(os.path.join(model_dir, "config.json"), "w") as f:
            f.write(f'{{"model": "{model_name}", "params": 135000000}}')
        with open(os.path.join(model_dir, "pytorch_model.bin"), "w") as f:
            f.write("dummy binary model data")

        saved_path = lab.save_model(model_dir, name="trained_model")
        lab.log(f"✅ Model saved to job models directory: {saved_path}")

        print("Complete")

        # Calculate final metrics for sweep optimization
        # These metrics will be used to determine the best configuration in a sweep
        final_loss = 0.5 - num_iterations * 0.05
        final_accuracy = 0.6 + num_iterations * 0.04
        
        # Simulate that better hyperparameters lead to better results
        # Lower learning rate and higher batch size might give better loss
        # This is just for demonstration - adjust the metric calculation as needed
        eval_loss = final_loss * (1.0 + learning_rate / 1e-4) * (1.0 - batch_size / 32.0)
        
        lab.log(f"Final metrics - Loss: {final_loss:.4f}, Accuracy: {final_accuracy:.4f}, Eval Loss: {eval_loss:.4f}")

        # Complete the job in TransformerLab via facade
        # Pass score/metrics for sweep optimization (sweep_metric defaults to "eval/loss")
        lab.finish(
            "Training completed successfully",
            score={
                "eval/loss": eval_loss,  # Default metric for sweeps (lower is better)
                "train/loss": final_loss,
                "accuracy": final_accuracy,
                "learning_rate": learning_rate,
                "batch_size": batch_size,
            }
        )

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(training_duration),
            "output_dir": os.path.join(output_dir, f"final_model_{lab.job.id}"),
            "saved_model_path": saved_path,
            "wandb_url": captured_wandb_url,
            "metrics": {
                "eval/loss": eval_loss,
                "train/loss": final_loss,
                "accuracy": final_accuracy,
            }
        }

    except KeyboardInterrupt:
        lab.error("Stopped by user or remotely")
        return {"status": "stopped", "job_id": lab.job.id}

    except Exception as e:
        error_msg = str(e)
        print(f"Training failed: {error_msg}")

        import traceback

        traceback.print_exc()
        lab.error(error_msg)
        return {"status": "error", "job_id": lab.job.id, "error": error_msg}


if __name__ == "__main__":
    result = train()
    print(result)
