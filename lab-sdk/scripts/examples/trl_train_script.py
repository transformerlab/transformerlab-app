#!/usr/bin/env python3
"""
Test script using HuggingFace SFTTrainer to demonstrate automatic wandb URL detection
when wandb is initialized within ML frameworks like TRL.
"""

import os
import argparse
from datetime import datetime
from time import sleep
from transformers import TrainerCallback, TrainerControl, TrainerState, TrainingArguments

from lab import lab

# Login to huggingface
from huggingface_hub import login
login(token=os.getenv("HF_TOKEN"))


class LabCallback(TrainerCallback):
    """Custom callback to update TransformerLab progress and save checkpoints"""
    
    def __init__(self):
        self.training_started = False
        self.total_steps = None
        
    def on_train_begin(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, **kwargs):
        """Called when training begins"""
        lab.log("🚀 Training started with HuggingFace Trainer")
        self.training_started = True
        if state.max_steps and state.max_steps > 0:
            self.total_steps = state.max_steps
        else:
            # Estimate steps if not provided
            self.total_steps = 1000
        
    def on_step_end(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, **kwargs):
        """Called after each training step"""
        if self.total_steps:
            progress = int((state.global_step / self.total_steps) * 100)
            progress = min(progress, 95)  # Keep some buffer for final operations
            lab.update_progress(progress)
            
        # Log training metrics if available
        if state.log_history:
            latest_log = state.log_history[-1]
            if "loss" in latest_log:
                lab.log(f"Step {state.global_step}: loss={latest_log['loss']:.4f}")
        
    def on_save(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, **kwargs):
        """Called when a checkpoint is saved"""
        lab.log(f"💾 Checkpoint saved at step {state.global_step}")
        
        # Attempt to save the checkpoint using lab's checkpoint mechanism
        if hasattr(args, 'output_dir'):
            checkpoint_dir = None
            # Find the most recent checkpoint
            if os.path.exists(args.output_dir):
                checkpoints = [d for d in os.listdir(args.output_dir) if d.startswith('checkpoint-')]
                if checkpoints:
                    # Sort by checkpoint number
                    checkpoints.sort(key=lambda x: int(x.split('-')[1]))
                    latest_checkpoint = checkpoints[-1]
                    checkpoint_dir = os.path.join(args.output_dir, latest_checkpoint)
                    
                    # Save checkpoint to TransformerLab
                    try:
                        saved_path = lab.save_checkpoint(checkpoint_dir, f"checkpoint-{state.global_step}")
                        lab.log(f"✅ Saved checkpoint to TransformerLab: {saved_path}")
                    except Exception as e:
                        lab.log(f"⚠️  Could not save checkpoint to TransformerLab: {e}")
    
    def on_epoch_end(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, **kwargs):
        """Called at the end of each epoch"""
        if state.epoch:
            lab.log(f"📊 Completed epoch {int(state.epoch)} / {args.num_train_epochs}")
    
    def on_train_end(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, **kwargs):
        """Called when training ends"""
        lab.log("✅ Training completed successfully")
        lab.update_progress(95)


def train_with_trl(quick_test=True):
    """Training function using HuggingFace SFTTrainer with automatic wandb detection
    
    Args:
        quick_test (bool): If True, only initializes trainer and tests wandb detection.
                          If False, actually runs training.
    """
    
    # Configure GPU usage - use only GPU 0
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"
    
    # Training configuration
    training_config = {
        "experiment_name": "trl-wandb-test",
        "model_name": "HuggingFaceTB/SmolLM-135M-Instruct",
        "dataset": "Trelis/touch-rugby-rules",
        "template_name": "trl-wandb-demo",
        "output_dir": "./output",
        "log_to_wandb": True,
        "quick_test": quick_test,
        "_config": {
            "dataset_name": "Trelis/touch-rugby-rules",
            "lr": 2e-5,
            "num_train_epochs": 1 if not quick_test else 0.01,  # Very short training for quick test
            "batch_size": 2,  # Small batch size for testing
            "gradient_accumulation_steps": 1,
            "warmup_ratio": 0.03,
            "weight_decay": 0.01,
            "logging_steps": 1,
            "save_steps": 100 if not quick_test else 1,
            "eval_steps": 100 if not quick_test else 1,
            "max_steps": 3 if quick_test else -1,  # Limit steps for quick test
            "report_to": ["wandb"],  # Enable wandb reporting in SFTTrainer
            "dataloader_num_workers": 0,  # Avoid multiprocessing issues
        },
    }

    try:
        # Initialize lab with default/simple API
        lab.init()
        lab.set_config(training_config)

        # Check if we should resume from a checkpoint
        checkpoint = lab.get_checkpoint_to_resume()
        if checkpoint:
            lab.log(f"📁 Resuming training from checkpoint: {checkpoint}")

        # Log start time
        start_time = datetime.now()
        mode = "Quick test" if quick_test else "Full training"
        lab.log(f"{mode} started at {start_time}")
        lab.log(f"Using GPU: {os.environ.get('CUDA_VISIBLE_DEVICES', 'All available')}")

        # Create output directory if it doesn't exist
        os.makedirs(training_config["output_dir"], exist_ok=True)

        # Load dataset
        lab.log("Loading dataset...")
        try:
            from datasets import load_dataset
            dataset = load_dataset(training_config["dataset"])
            lab.log(f"Loaded dataset with {len(dataset['train'])} examples")
            
            # For quick test, use only a small subset
            if quick_test:
                dataset["train"] = dataset["train"].select(range(10))  # Use only 10 examples
                lab.log(f"Quick test mode: Using only {len(dataset['train'])} examples")
                
        except Exception as e:
            lab.log(f"Error loading dataset: {e}")
            # Create a small fake dataset for testing
            from datasets import Dataset
            dataset = {
                "train": Dataset.from_list([
                    {"text": "What are the rules of touch rugby?"},
                    {"text": "How many players are on a touch rugby team?"},
                    {"text": "What is the objective of touch rugby?"},
                ])
            }
            lab.log("Using fake dataset for testing")

        lab.update_progress(20)

        # Load model and tokenizer
        lab.log("Loading model and tokenizer...")
        try:
            from transformers import AutoTokenizer, AutoModelForCausalLM

            model_name = training_config["model_name"]
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = AutoModelForCausalLM.from_pretrained(model_name)

            # Add pad token if it doesn't exist
            if tokenizer.pad_token is None:
                tokenizer.pad_token = tokenizer.eos_token
            
            lab.log(f"Loaded model: {model_name}")

        except ImportError:
            lab.log("⚠️  Transformers not available, skipping real training")
            lab.finish("Training skipped - transformers not available")
            return {"status": "skipped", "reason": "transformers not available"}
        except Exception as e:
            lab.log(f"Error loading model: {e}")
            lab.finish("Training failed - model loading error")
            return {"status": "error", "error": str(e)}

        lab.update_progress(40)

        # Set up SFTTrainer with wandb integration
        lab.log("Setting up SFTTrainer with wandb integration...")
        try:
            from trl import SFTTrainer, SFTConfig
            
            # SFTConfig with wandb reporting and automatic checkpoint saving
            training_args = SFTConfig(
                output_dir=training_config["output_dir"],
                num_train_epochs=training_config["_config"]["num_train_epochs"],
                per_device_train_batch_size=training_config["_config"]["batch_size"],
                gradient_accumulation_steps=training_config["_config"]["gradient_accumulation_steps"],
                learning_rate=training_config["_config"]["lr"],
                warmup_ratio=training_config["_config"]["warmup_ratio"],
                weight_decay=training_config["_config"]["weight_decay"],
                logging_steps=training_config["_config"]["logging_steps"],
                save_steps=training_config["_config"]["save_steps"],
                eval_steps=training_config["_config"]["eval_steps"],
                report_to=["wandb"],
                run_name=f"trl-test-{lab.job.id}",
                logging_dir=f"{training_config['output_dir']}/logs",
                remove_unused_columns=False,
                push_to_hub=False,
                dataset_text_field="text",  # Move dataset_text_field to SFTConfig
                resume_from_checkpoint=checkpoint if checkpoint else None,
                bf16=False,  # Disable bf16 for compatibility with older GPUs
                # Enable automatic checkpoint saving
                save_total_limit=3,  # Keep only the last 3 checkpoints to save disk space
                save_strategy="steps",  # Save checkpoints every save_steps
                load_best_model_at_end=False,
            )
            
            # Create custom callback for TransformerLab integration
            transformerlab_callback = LabCallback()
            
            trainer = SFTTrainer(
                model=model,
                args=training_args,
                train_dataset=dataset["train"],
                processing_class=tokenizer,
                callbacks=[transformerlab_callback],  # Add our custom callback
            )
            
            lab.log("✅ SFTTrainer created - wandb should be initialized automatically!")
            lab.log("🔍 Checking for wandb URL detection...")
            

        except Exception as e:
            lab.log(f"Error setting up SFTTrainer: {e}")
            lab.finish("Training failed - trainer setup error")
            return {"status": "error", "error": str(e)}

        lab.update_progress(60)

        # Start training - this is where wandb will be initialized if using SFTTrainer
        if quick_test:
            lab.log("🚀 Quick test mode: Initializing SFTTrainer and testing wandb detection...")
        else:
            lab.log("Starting training...")
            
        try:
            if 'trainer' in locals():
                # Real training with SFTTrainer
                if quick_test:
                    lab.log("✅ SFTTrainer initialized successfully...")
                    # Just test that wandb is initialized, don't actually train
                    lab.log("Quick test: Skipping actual training, just testing wandb URL detection")
                else:
                    # Training will automatically save checkpoints via the callback
                    trainer.train()
                    lab.log("✅ Training completed with SFTTrainer")
                    
                    
                    # Create 2 additional artifacts for full training
                    # Artifact 1: Training progress summary
                    progress_file = os.path.join(training_config["output_dir"], "training_progress_summary.json")
                    with open(progress_file, "w") as f:
                        f.write('{\n')
                        f.write('  "training_type": "SFTTrainer",\n')
                        f.write('  "total_epochs": 5,\n')
                        f.write('  "final_loss": 0.10,\n')
                        f.write('  "final_accuracy": 0.95,\n')
                        f.write(f'  "model_name": "{training_config["model_name"]}",\n')
                        f.write(f'  "dataset": "{training_config["dataset"]}",\n')
                        f.write(f'  "completed_at": "{datetime.now().isoformat()}"\n')
                        f.write('}\n')
                    
                    progress_artifact_path = lab.save_artifact(progress_file, "training_progress_summary.json")
                    lab.log(f"Saved training progress: {progress_artifact_path}")
                    
                    # Artifact 2: Model performance metrics
                    metrics_file = os.path.join(training_config["output_dir"], "model_performance_metrics.json")
                    with open(metrics_file, "w") as f:
                        f.write('{\n')
                        f.write('  "performance_metrics": {\n')
                        f.write('    "training_loss": [0.45, 0.37, 0.29, 0.21, 0.10],\n')
                        f.write('    "training_accuracy": [0.68, 0.76, 0.84, 0.91, 0.95],\n')
                        f.write('    "validation_loss": [0.48, 0.40, 0.32, 0.24, 0.12],\n')
                        f.write('    "validation_accuracy": [0.65, 0.73, 0.81, 0.88, 0.93]\n')
                        f.write('  },\n')
                        f.write('  "training_config": {\n')
                        f.write(f'    "learning_rate": {training_config["_config"]["lr"]},\n')
                        f.write(f'    "batch_size": {training_config["_config"]["batch_size"]},\n')
                        f.write(f'    "num_epochs": {training_config["_config"]["num_train_epochs"]},\n')
                        f.write(f'    "warmup_ratio": {training_config["_config"]["warmup_ratio"]}\n')
                        f.write('  }\n')
                        f.write('}\n')
                    
                    metrics_artifact_path = lab.save_artifact(metrics_file, "model_performance_metrics.json")
                    lab.log(f"Saved performance metrics: {metrics_artifact_path}")
            else:
                # Simulate training
                lab.log("Simulating training...")
                steps = 3 if quick_test else 10
                for i in range(steps):
                    sleep(0.5 if quick_test else 1)
                    lab.log(f"Training step {i + 1}/{steps}")
                    lab.update_progress(60 + (i + 1) * (30 // steps))
                    
                    # Save fake checkpoint every 2 steps
                    if (i + 1) % 2 == 0:
                        checkpoint_file = os.path.join(training_config["output_dir"], f"checkpoint_step_{i + 1}.txt")
                        with open(checkpoint_file, "w") as f:
                            f.write(f"Fake checkpoint for step {i + 1}\n")
                            f.write(f"Model state: step_{i + 1}\n")
                            f.write(f"Loss: {0.5 - (i + 1) * 0.1:.3f}\n")
                            f.write(f"Accuracy: {0.6 + (i + 1) * 0.1:.3f}\n")
                            f.write(f"Timestamp: {datetime.now()}\n")
                        
                        # Save checkpoint using lab facade
                        saved_checkpoint_path = lab.save_checkpoint(checkpoint_file, f"step_{i + 1}_checkpoint.txt")
                        lab.log(f"Saved checkpoint: {saved_checkpoint_path}")
                        
                        # Save some fake artifacts
                        artifact_file = os.path.join(training_config["output_dir"], f"training_metrics_step_{i + 1}.json")
                        with open(artifact_file, "w") as f:
                            f.write('{\n')
                            f.write(f'  "step": {i + 1},\n')
                            f.write(f'  "loss": {0.5 - (i + 1) * 0.1:.3f},\n')
                            f.write(f'  "accuracy": {0.6 + (i + 1) * 0.1:.3f},\n')
                            f.write(f'  "learning_rate": {training_config["_config"]["lr"]},\n')
                            f.write(f'  "batch_size": {training_config["_config"]["batch_size"]},\n')
                            f.write(f'  "timestamp": "{datetime.now().isoformat()}"\n')
                            f.write('}\n')
                        
                        # Save artifact using lab facade
                        saved_artifact_path = lab.save_artifact(artifact_file, f"metrics_step_{i + 1}.json")
                        lab.log(f"Saved artifact: {saved_artifact_path}")
                    
                    # Log some fake metrics to wandb if available
                    try:
                        import wandb
                        if wandb.run is not None:
                            fake_loss = 0.5 - (i + 1) * 0.1
                            fake_accuracy = 0.6 + (i + 1) * 0.1
                            wandb.log({
                                "train/loss": fake_loss,
                                "train/accuracy": fake_accuracy,
                                "step": i + 1
                            })
                            lab.log(f"📈 Logged metrics to wandb: loss={fake_loss:.3f}, accuracy={fake_accuracy:.3f}")
                    except Exception:
                        pass
                        
        except Exception as e:
            lab.log(f"Error during training: {e}")
            # Continue to check for wandb URL even if training fails

        lab.update_progress(90)

        # Calculate training time
        end_time = datetime.now()
        training_duration = end_time - start_time
        lab.log(f"Training completed in {training_duration}")
        
        # Save final artifacts
        final_model_file = os.path.join(training_config["output_dir"], "final_model_summary.txt")
        with open(final_model_file, "w") as f:
            f.write("Final Model Summary\n")
            f.write("==================\n")
            f.write(f"Training Duration: {training_duration}\n")
            f.write("Final Loss: 0.15\n")
            f.write("Final Accuracy: 0.92\n")
            f.write(f"Model: {training_config['model_name']}\n")
            f.write(f"Dataset: {training_config['dataset']}\n")
            f.write(f"Completed at: {end_time}\n")
        
        # Save final model as artifact
        final_model_path = lab.save_artifact(final_model_file, "final_model_summary.txt")
        lab.log(f"Saved final model summary: {final_model_path}")
        
        # Save training configuration as artifact
        config_file = os.path.join(training_config["output_dir"], "training_config.json")
        import json
        with open(config_file, "w") as f:
            json.dump(training_config, f, indent=2)
        
        config_artifact_path = lab.save_artifact(config_file, "training_config.json")
        lab.log(f"Saved training config: {config_artifact_path}")
        
        # Save the trained model
        model_dir = os.path.join(training_config["output_dir"], "final_model")
        os.makedirs(model_dir, exist_ok=True)
        
        # Create dummy model files to simulate a saved model
        with open(os.path.join(model_dir, "config.json"), "w") as f:
            f.write('{"model": "SmolLM-135M-Instruct", "params": 135000000}')
        with open(os.path.join(model_dir, "pytorch_model.bin"), "w") as f:
            f.write("dummy binary model data")
        
        saved_path = lab.save_model(model_dir, name="trained_model")
        lab.log(f"✅ Model saved to job models directory: {saved_path}")
        
        # Get the captured wandb URL from job data for reporting
        job_data = lab.job.get_job_data()
        captured_wandb_url = job_data.get("wandb_run_url", "None")
        lab.log(f"📋 Final wandb URL stored in job data: {captured_wandb_url}")
        
        # Finish wandb run if it was initialized
        try:
            import wandb
            if wandb.run is not None:
                wandb.finish()
                lab.log("✅ Wandb run finished")
        except Exception:
            pass
        
        print("Complete")

        # Complete the job in TransformerLab via facade
        lab.finish("Training completed successfully with SFTTrainer")

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(training_duration),
            "output_dir": training_config["output_dir"],
            "saved_model_path": saved_path,
            "wandb_url": captured_wandb_url,
            "trainer_type": "SFTTrainer" if 'trainer' in locals() else "simulated",
            "mode": "quick_test" if quick_test else "full_training",
            "gpu_used": os.environ.get('CUDA_VISIBLE_DEVICES', 'all'),
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
    
    parser = argparse.ArgumentParser(description="Train a model with automatic checkpoint resume support.")
    parser.add_argument("--quick-training", action="store_true", help="Run in quick test mode")
    
    args = parser.parse_args()
    
    quick_test = args.quick_training
    
    if quick_test:
        print("🚀 Running quick test mode...")
    else:
        print("🚀 Running full training mode...")

    result = train_with_trl(quick_test=quick_test)
    print("Training result:", result)
