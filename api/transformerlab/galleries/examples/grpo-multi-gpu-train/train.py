import os
import time
import re
import torch
from jinja2 import Environment
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import GRPOConfig, GRPOTrainer
from accelerate import Accelerator
from datetime import datetime
from transformers import (
    TrainingArguments,
    TrainerCallback,
    TrainerControl,
    TrainerState,
)

from lab import lab

# Login to huggingface
from huggingface_hub import login

if os.getenv("HF_TOKEN"):
    login(token=os.getenv("HF_TOKEN"))

# Set up environment
jinja_environment = Environment()


class LabCallback(TrainerCallback):
    """Custom callback to update TransformerLab progress and save checkpoints"""

    def __init__(self):
        self.training_started = False
        self.total_steps = None

    def on_train_begin(
        self,
        args: TrainingArguments,
        state: TrainerState,
        control: TrainerControl,
        **kwargs,
    ):
        """Called when training begins"""
        lab.log("🚀 Training started with Multi-GPU GRPO")
        self.training_started = True
        if state.max_steps and state.max_steps > 0:
            self.total_steps = state.max_steps
        else:
            # Estimate steps if not provided
            self.total_steps = 100

    def on_step_end(
        self,
        args: TrainingArguments,
        state: TrainerState,
        control: TrainerControl,
        **kwargs,
    ):
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

    def on_save(
        self,
        args: TrainingArguments,
        state: TrainerState,
        control: TrainerControl,
        **kwargs,
    ):
        """Called when a checkpoint is saved"""
        lab.log(f"💾 Checkpoint saved at step {state.global_step}")

        # Attempt to save the checkpoint using lab's checkpoint mechanism
        if hasattr(args, "output_dir"):
            checkpoint_dir = None
            # Find the most recent checkpoint
            if os.path.exists(args.output_dir):
                checkpoints = [d for d in os.listdir(args.output_dir) if d.startswith("checkpoint-")]
                if checkpoints:
                    # Sort by checkpoint number
                    checkpoints.sort(key=lambda x: int(x.split("-")[1]))
                    latest_checkpoint = checkpoints[-1]
                    checkpoint_dir = os.path.join(args.output_dir, latest_checkpoint)

                    # Save checkpoint to TransformerLab
                    try:
                        saved_path = lab.save_checkpoint(checkpoint_dir, f"checkpoint-{state.global_step}")
                        lab.log(f"✅ Saved checkpoint to TransformerLab: {saved_path}")
                    except Exception as e:
                        lab.log(f"⚠️  Could not save checkpoint to TransformerLab: {e}")

    def on_epoch_end(
        self,
        args: TrainingArguments,
        state: TrainerState,
        control: TrainerControl,
        **kwargs,
    ):
        """Called at the end of each epoch"""
        if state.epoch:
            lab.log(f"📊 Completed epoch {int(state.epoch)} / {args.num_train_epochs}")

    def on_train_end(
        self,
        args: TrainingArguments,
        state: TrainerState,
        control: TrainerControl,
        **kwargs,
    ):
        """Called when training ends"""
        lab.log("✅ Training completed successfully")
        lab.update_progress(95)


def extract_answer(text: str, start_answer_string, end_answer_string) -> str:
    """Extract the answer from the text between start and end tags"""
    answer = text.split(f"{start_answer_string}")[-1]
    answer = answer.split(f"{end_answer_string}")[0]
    return answer.strip()


def count_xml(text, start_thinking_string, end_thinking_string, start_answer_string, end_answer_string) -> float:
    """Count XML tags in the response"""
    count = 0.0
    if text.count(f"{start_thinking_string}\n") == 1:
        count += 0.125
    if text.count(f"\n{end_thinking_string}\n") == 1:
        count += 0.125
    if text.count(f"\n{start_answer_string}\n") == 1:
        count += 0.125
        count -= len(text.split(f"\n{end_answer_string}\n")[-1]) * 0.001
    if text.count(f"\n{end_answer_string}") == 1:
        count += 0.125
        count -= (len(text.split(f"\n{end_answer_string}")[-1]) - 1) * 0.001
    return count


def train_model():
    """Train a model using GRPO with multi-GPU setup."""

    # Training configuration
    training_config = {
        "experiment_name": "grpo-multi-gpu-training",
        "model_name": "unsloth/SmolLM2-135M",  # Example model
        "dataset": "openai/gsm8k",  # Example dataset for reasoning
        "template_name": "grpo-multi-gpu-demo",
        "output_dir": "./output",
        "log_to_wandb": False,
        "_config": {
            "dataset_name": "openai/gsm8k",
            "dataset_config": "main",
            "dataset_split": "train",
            "dataset_input_field": "question",
            "dataset_output_field": "answer",
            "start_thinking_string": "<reasoning>",
            "end_thinking_string": "</reasoning>",
            "start_answer_string": "<answer>",
            "end_answer_string": "</answer>",
            "maximum_sequence_length": 1024,
            "maximum_completion_length": 512,
            "max_grad_norm": 0.3,
            "learning_rate": 5e-05,
            "learning_rate_schedule": "constant",
            "batch_size": 4,
            "num_train_epochs": 1,
            "weight_decay": 0.0,
            "adam_beta1": 0.9,
            "adam_beta2": 0.999,
            "adam_epsilon": 1e-08,
            "max_steps": 5,  # -1 means use num_train_epochs
            "train_device": "cuda",
            "gpu_ids": "auto",  # auto means use all available GPUs
            # Template configuration
            "system_prompt": "You are a helpful assistant that solves math problems step by step.",
            "input_template": "{{ question }}",
            "output_template": "{{ answer }}",
        },
    }

    try:
        # Initialize lab with default/simple API
        lab.init()
        lab.set_config(training_config)

        if training_config.get("log_to_wandb", False):
            try:
                import wandb

                api_key = os.getenv("WANDB_API_KEY")
                if api_key:
                    wandb.login(key=api_key)
                    lab.log("✅ WandB login succeeded")
                else:
                    lab.log("⚠️ WANDB_API_KEY not set, WandB may use anonymous mode")
            except Exception as e:
                lab.log(f"⚠️ WandB login failed: {e}")

        checkpoint = lab.get_checkpoint_to_resume()
        if checkpoint:
            lab.log(f"📁 Resuming training from checkpoint: {checkpoint}")

        # Log start time
        start_time = datetime.now()
        lab.log(f"Training started at {start_time}")

        # Initialize Accelerator for multi-GPU
        accelerator = Accelerator()
        lab.log(f"🚀 Running with accelerate on {accelerator.num_processes} processes")
        lab.log(f"Using device: {accelerator.device}")

        # Create output directory if it doesn't exist
        os.makedirs(training_config["output_dir"], exist_ok=True)

        # Load dataset
        lab.log("Loading dataset...")
        try:
            from datasets import load_dataset

            datasets = load_dataset(
                training_config["_config"]["dataset_name"], training_config["_config"]["dataset_config"]
            )
            dataset = datasets[training_config["_config"]["dataset_split"]]
            lab.log(f"Loaded dataset with {len(dataset)} training examples.")

        except Exception as e:
            lab.log(f"❌ Failed to load dataset: {e}")
            lab.error("Training failed due to dataset loading error.")
            return {"status": "error", "error": str(e)}

        lab.update_progress(10)

        # Get configuration values
        model_id = training_config["model_name"]
        max_completion_length = int(training_config["_config"]["maximum_completion_length"])
        learning_rate = float(training_config["_config"]["learning_rate"])
        learning_rate_schedule = training_config["_config"].get("learning_rate_schedule", "constant")
        max_grad_norm = float(training_config["_config"]["max_grad_norm"])
        batch_size = int(training_config["_config"]["batch_size"])
        num_epochs = int(training_config["_config"]["num_train_epochs"])
        weight_decay = float(training_config["_config"]["weight_decay"])
        adam_beta1 = float(training_config["_config"]["adam_beta1"])
        adam_beta2 = float(training_config["_config"]["adam_beta2"])
        adam_epsilon = float(training_config["_config"]["adam_epsilon"])
        max_steps = int(training_config["_config"]["max_steps"])
        output_dir = training_config["output_dir"]

        # Template configuration
        question_formatting_template = training_config["_config"].get("input_template", "{{ question }}")
        answer_formatting_template = training_config["_config"].get("output_template", "{{ answer }}")
        system_prompt = training_config["_config"].get("system_prompt", "")

        start_thinking_string = training_config["_config"].get("start_thinking_string", "<reasoning>")
        end_thinking_string = training_config["_config"].get("end_thinking_string", "</reasoning>")
        start_answer_string = training_config["_config"].get("start_answer_string", "<answer>")
        end_answer_string = training_config["_config"].get("end_answer_string", "</answer>")

        lab.update_progress(20)

        # Determine if the instruction template is missing the necessary strings
        if start_thinking_string not in system_prompt or start_answer_string not in system_prompt:
            system_prompt = f"""
        Respond in the following format:
            {start_thinking_string}
            ...
            {end_thinking_string}
            {start_answer_string}
            ...
            {end_answer_string}
        """

        # Format instruction function
        def format_instruction(template, mapping):
            return template.render(mapping)

        # Create templates
        lab.log("Preparing dataset templates...")
        question_template = jinja_environment.from_string(question_formatting_template)
        answer_template = jinja_environment.from_string(answer_formatting_template)

        # Process dataset
        lab.log("Processing dataset...")
        dataset = dataset.map(
            lambda x: {
                "prompt": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": format_instruction(question_template, x)},
                ],
                "answer": format_instruction(answer_template, x).split("#### ")[-1],
            }
        )

        lab.update_progress(30)

        # Define reward functions
        def correctness_reward_func(prompts, completions, answer, **kwargs) -> list[float]:
            responses = [completion[0]["content"] for completion in completions]
            extracted_responses = [extract_answer(r, start_answer_string, end_answer_string) for r in responses]
            return [2.0 if r == a else 0.0 for r, a in zip(extracted_responses, answer)]

        def xmlcount_reward_func(completions, **kwargs) -> list[float]:
            contents = [completion[0]["content"] for completion in completions]
            return [
                count_xml(c, start_thinking_string, end_thinking_string, start_answer_string, end_answer_string)
                for c in contents
            ]

        def extract_xml_answer(text: str) -> str:
            return extract_answer(text, start_answer_string, end_answer_string)

        def int_reward_func(completions, **kwargs) -> list[float]:
            """Reward function that checks if the answer is a number"""
            responses = [completion[0]["content"] for completion in completions]
            extracted_responses = [extract_xml_answer(r) for r in responses]
            return [0.5 if r.isdigit() else 0.0 for r in extracted_responses]

        def strict_format_reward_func(completions, **kwargs) -> list[float]:
            """Reward function that checks strictly if the completion has a specific format."""
            pattern = rf"^{start_thinking_string}\n.*?\n{end_thinking_string}\n{start_answer_string}\n.*?\n{end_answer_string}\n$"
            responses = [completion[0]["content"] for completion in completions]
            matches = [re.match(pattern, r) for r in responses]
            return [0.5 if match else 0.0 for match in matches]

        def soft_format_reward_func(completions, **kwargs) -> list[float]:
            """Reward function that checks if the completion has a specific format."""
            pattern = rf"{start_thinking_string}.*?{end_thinking_string}\s*{start_answer_string}.*?{end_answer_string}"
            responses = [completion[0]["content"] for completion in completions]
            matches = [re.match(pattern, r) for r in responses]
            return [0.5 if match else 0.0 for match in matches]

        lab.update_progress(40)

        # Load model and tokenizer
        lab.log("Loading model and tokenizer...")
        try:
            # Use device_map=None for multi-GPU with accelerate
            device_map = None if accelerator.num_processes > 1 else "auto"

            tokenizer = AutoTokenizer.from_pretrained(model_id)
            tokenizer.padding_side = "right"

            # Set chat template for SmolLM2 if not present
            if tokenizer.chat_template is None:
                tokenizer.chat_template = "{% for message in messages %}{{ message['role'] }}: {{ message['content'] }}\n{% endfor %}assistant: "

            model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype=torch.bfloat16, device_map=device_map)
            lab.log(f"✅ Model loaded: {model_id}")
        except Exception as e:
            lab.log(f"❌ Failed to load model: {e}")
            import traceback

            traceback.print_exc()
            lab.error("Training failed due to model loading error.")
            return {"status": "error", "error": str(e)}

        lab.update_progress(50)

        # Training run name
        today = time.strftime("%Y%m%d-%H%M%S")
        run_suffix = training_config.get("template_name", today)

        lab.update_progress(60)

        # GRPO training configuration
        lab.log("Setting up GRPO trainer...")
        args = GRPOConfig(
            output_dir=output_dir,
            logging_dir=os.path.join(output_dir, f"logs_{run_suffix}"),
            num_train_epochs=num_epochs,
            max_steps=max_steps if max_steps > 0 else -1,
            weight_decay=weight_decay,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=2,
            gradient_checkpointing=True,
            optim="paged_adamw_32bit",
            logging_steps=10,
            save_strategy="epoch",
            learning_rate=learning_rate,
            bf16=True,
            tf32=True,
            max_grad_norm=max_grad_norm,
            warmup_ratio=0.03,
            max_completion_length=max_completion_length,
            lr_scheduler_type=learning_rate_schedule,
            adam_beta1=adam_beta1,
            adam_beta2=adam_beta2,
            adam_epsilon=adam_epsilon,
            disable_tqdm=False,
            run_name=f"grpo_{run_suffix}",
            report_to="wandb" if training_config.get("log_to_wandb", False) else "none",
            ddp_find_unused_parameters=False,
            dataloader_pin_memory=True,
            resume_from_checkpoint=checkpoint if checkpoint else None,
        )

        # Create progress callback using lab
        progress_callback = LabCallback()

        # Initialize GRPO trainer
        trainer = GRPOTrainer(
            model=model,
            train_dataset=dataset,
            reward_funcs=[
                xmlcount_reward_func,
                correctness_reward_func,
                int_reward_func,
                strict_format_reward_func,
                soft_format_reward_func,
            ],
            args=args,
            processing_class=tokenizer,
            callbacks=[progress_callback],
        )

        lab.update_progress(70)

        # Train the model
        lab.log("Starting training...")
        try:
            trainer.train()
            lab.log("✅ Training completed successfully")

            # Save the fine-tuned model
            lab.log("Saving fine-tuned model...")
            trainer.save_model(output_dir=output_dir)
            lab.log("✅ Model saved")

            # Create training summary artifact
            progress_file = os.path.join(output_dir, "training_summary.json")
            import json

            with open(progress_file, "w") as f:
                json.dump(
                    {
                        "training_type": "Multi-GPU GRPO",
                        "model_name": training_config["model_name"],
                        "dataset": training_config["_config"]["dataset_name"],
                        "num_gpus": accelerator.num_processes,
                        "max_seq_length": training_config["_config"]["maximum_sequence_length"],
                        "max_completion_length": training_config["_config"]["maximum_completion_length"],
                        "learning_rate": training_config["_config"]["learning_rate"],
                        "batch_size": training_config["_config"]["batch_size"],
                        "gradient_accumulation_steps": 2,
                        "completed_at": datetime.now().isoformat(),
                    },
                    f,
                    indent=2,
                )

            progress_artifact_path = lab.save_artifact(progress_file, "training_summary.json")
            lab.log(f"Saved training summary: {progress_artifact_path}")

        except Exception as e:
            lab.log(f"Error during training: {e}")
            import traceback

            traceback.print_exc()
            lab.finish("Training failed")
            return {"status": "error", "error": str(e)}

        lab.update_progress(90)

        # Calculate training time
        end_time = datetime.now()
        training_duration = end_time - start_time
        lab.log(f"Training completed in {training_duration}")

        # Save final artifacts
        final_model_file = os.path.join(output_dir, "final_model_summary.txt")
        with open(final_model_file, "w") as f:
            f.write("Final Model Summary\n")
            f.write("==================\n")
            f.write("Training Type: GRPO (Group Relative Policy Optimization) with Multi-GPU\n")
            f.write(f"Training Duration: {training_duration}\n")
            f.write(f"Model: {training_config['model_name']}\n")
            f.write(f"Dataset: {training_config['_config']['dataset_name']}\n")
            f.write(f"Number of GPUs: {accelerator.num_processes}\n")
            f.write(f"Device: {accelerator.device}\n")
            f.write(f"Completed at: {end_time}\n")

        final_model_path = lab.save_artifact(final_model_file, "final_model_summary.txt")
        lab.log(f"Saved final model summary: {final_model_path}")

        # Save training configuration as artifact
        config_file = os.path.join(output_dir, "training_config.json")
        with open(config_file, "w") as f:
            import json

            json.dump(training_config, f, indent=2)

        config_artifact_path = lab.save_artifact(config_file, "training_config.json")
        lab.log(f"Saved training config: {config_artifact_path}")

        # Save the trained model
        model_dir = os.path.join(output_dir, "final_model")
        os.makedirs(model_dir, exist_ok=True)

        # Copy model files to final_model directory
        import shutil

        for file in os.listdir(output_dir):
            if file.endswith((".bin", ".safetensors", ".json", ".txt")) and not file.startswith("checkpoint"):
                src = os.path.join(output_dir, file)
                dst = os.path.join(model_dir, file)
                if os.path.isfile(src):
                    shutil.copy2(src, dst)

        saved_path = lab.save_model(model_dir, name="grpo_multi_gpu_trained_model")
        lab.log(f"✅ Model saved to job models directory: {saved_path}")

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
        lab.finish("Training completed successfully with Multi-GPU GRPO")

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(training_duration),
            "output_dir": output_dir,
            "saved_model_path": saved_path,
            "trainer_type": "Multi-GPU GRPO",
            "num_gpus": accelerator.num_processes,
            "device": str(accelerator.device),
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
    print("🚀 Starting Multi-GPU GRPO training...")
    result = train_model()
    print("Training result:", result)
