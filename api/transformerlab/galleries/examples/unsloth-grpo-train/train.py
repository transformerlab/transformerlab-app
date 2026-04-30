from unsloth import FastLanguageModel, PatchFastRL
import time
import re
import os
import torch
from jinja2 import Environment
from transformers import BitsAndBytesConfig
from trl import GRPOConfig, GRPOTrainer
from datetime import datetime
import requests as http_requests
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

# Patch FastRL for GRPO
PatchFastRL("GRPO", FastLanguageModel)


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
        lab.log("🚀 Training started with Unsloth GRPO")
        self.training_started = True
        if state.max_steps and state.max_steps > 0:
            self.total_steps = state.max_steps
        else:
            # Estimate steps if not provided (now 5 for ultra-quick testing)
            self.total_steps = 5

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
    """Train a model using GRPO with unsloth."""

    # Configure GPU usage - use only GPU 0
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"

    try:
        # Initialize lab
        lab.init()

        # Get parameters from task configuration
        config = lab.get_config()

        # Extract parameters with defaults
        model_name = config.get("model_name", "unsloth/SmolLM2-135M")
        dataset = config.get("dataset", "openai/gsm8k")
        dataset_config = config.get("dataset_config", "main")
        dataset_split = config.get("dataset_split", "train")
        dataset_input_field = config.get("dataset_input_field", "question")
        dataset_output_field = config.get("dataset_output_field", "answer")
        start_thinking_string = config.get("start_thinking_string", "<reasoning>")
        end_thinking_string = config.get("end_thinking_string", "</reasoning>")
        start_answer_string = config.get("start_answer_string", "<answer>")
        end_answer_string = config.get("end_answer_string", "</answer>")
        lora_alpha = config.get("lora_alpha", 32)
        lora_dropout = config.get("lora_dropout", 0.05)
        lora_r = config.get("lora_r", 16)
        maximum_sequence_length = config.get("maximum_sequence_length", 1024)
        maximum_completion_length = config.get("maximum_completion_length", 512)
        max_grad_norm = config.get("max_grad_norm", 0.3)
        learning_rate = config.get("learning_rate", 5e-05)
        learning_rate_schedule = config.get("learning_rate_schedule", "constant")
        batch_size = config.get("batch_size", 1)
        num_train_epochs = config.get("num_train_epochs", 1)
        weight_decay = config.get("weight_decay", 0.0)
        adam_beta1 = config.get("adam_beta1", 0.9)
        adam_beta2 = config.get("adam_beta2", 0.999)
        adam_epsilon = config.get("adam_epsilon", 1e-08)
        max_steps = config.get("max_steps", 5)
        beta = config.get("beta", 0.04)
        num_iterations = config.get("num_iterations", 2)
        system_prompt = config.get(
            "system_prompt", "You are a helpful assistant that solves math problems step by step."
        )
        input_template = config.get("input_template", "{{ question }}")
        output_template = config.get("output_template", "{{ answer }}")

        # LLM-as-Judge configuration
        llm_judge_enabled = str(config.get("llm_judge_enabled", False)).lower() in ("true", "1", "yes")
        llm_judge_server_url = config.get("llm_judge_server_url", "")
        llm_judge_model_name = config.get("llm_judge_model_name", "")
        llm_judge_prompt = config.get(
            "llm_judge_prompt",
            (
                "Rate the quality of the following response to the given question.\n"
                "Consider correctness, clarity, and reasoning quality.\n\n"
                "Question: {prompt}\n\n"
                "Response: {completion}\n\n"
                "Score (respond with ONLY a number between 0.0 and 2.0, "
                "where 0.0 is completely wrong and 2.0 is perfect):"
            ),
        )
        if llm_judge_enabled:
            lab.log(f"🔍 LLM-as-Judge enabled: model={llm_judge_model_name} at {llm_judge_server_url}")

        # Training configuration
        training_config = {
            "experiment_name": "unsloth-grpo-training",
            "model_name": model_name,
            "dataset": dataset,
            "template_name": "unsloth-grpo-demo",
            "output_dir": "./output",
            "log_to_wandb": False,
            "_config": {
                "dataset_name": dataset,
                "dataset_config": dataset_config,
                "dataset_split": dataset_split,
                "dataset_input_field": dataset_input_field,
                "dataset_output_field": dataset_output_field,
                "start_thinking_string": start_thinking_string,
                "end_thinking_string": end_thinking_string,
                "start_answer_string": start_answer_string,
                "end_answer_string": end_answer_string,
                "lora_alpha": lora_alpha,
                "lora_dropout": lora_dropout,
                "lora_r": lora_r,
                "maximum_sequence_length": maximum_sequence_length,
                "maximum_completion_length": maximum_completion_length,
                "max_grad_norm": max_grad_norm,
                "learning_rate": learning_rate,
                "learning_rate_schedule": learning_rate_schedule,
                "batch_size": batch_size,
                "num_train_epochs": num_train_epochs,
                "weight_decay": weight_decay,
                "adam_beta1": adam_beta1,
                "adam_beta2": adam_beta2,
                "adam_epsilon": adam_epsilon,
                "max_steps": max_steps,
                "beta": beta,
                "num_iterations": num_iterations,
                "device": "cuda" if torch.cuda.is_available() else "cpu",
                # Template configuration
                "system_prompt": system_prompt,
                "input_template": input_template,
                "output_template": output_template,
            },
        }

        lab.set_config(training_config)

        checkpoint = lab.get_checkpoint_to_resume()
        if checkpoint:
            lab.log(f"📁 Resuming training from checkpoint: {checkpoint}")

        # Log start time
        start_time = datetime.now()
        lab.log(f"Training started at {start_time}")
        lab.log(f"Using GPU: {os.environ.get('CUDA_VISIBLE_DEVICES', 'All available')}")

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
        max_seq_length = int(training_config["_config"]["maximum_sequence_length"])
        max_completion_length = int(training_config["_config"]["maximum_completion_length"])
        lora_rank = int(training_config["_config"]["lora_r"])
        lora_alpha = int(training_config["_config"]["lora_alpha"])
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
        beta = float(training_config["_config"]["beta"])
        num_iterations_val = int(training_config["_config"]["num_iterations"])
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
                "prompt": f"{system_prompt}\n\nQuestion: {format_instruction(question_template, x)}",
                "answer": format_instruction(answer_template, x).split("#### ")[-1],
            }
        )

        lab.update_progress(30)

        # Reward functions
        def correctness_reward_func(prompts, completions, answer, **kwargs) -> list[float]:
            responses = [
                completion if isinstance(completion, str) else completion[0]["content"] for completion in completions
            ]
            extracted_responses = [extract_answer(r, start_answer_string, end_answer_string) for r in responses]
            return [2.0 if r == a else 0.0 for r, a in zip(extracted_responses, answer)]

        def xmlcount_reward_func(completions, **kwargs) -> list[float]:
            contents = [
                completion if isinstance(completion, str) else completion[0]["content"] for completion in completions
            ]
            return [
                count_xml(c, start_thinking_string, end_thinking_string, start_answer_string, end_answer_string)
                for c in contents
            ]

        def extract_xml_answer(text: str) -> str:
            return extract_answer(text, start_answer_string, end_answer_string)

        def int_reward_func(completions, **kwargs) -> list[float]:
            """Reward function that checks if the answer is a number"""
            responses = [
                completion if isinstance(completion, str) else completion[0]["content"] for completion in completions
            ]
            extracted_responses = [extract_xml_answer(r) for r in responses]
            return [0.5 if r.isdigit() else 0.0 for r in extracted_responses]

        def strict_format_reward_func(completions, **kwargs) -> list[float]:
            """Reward function that checks strictly if the completion has a specific format."""
            pattern = rf"^{start_thinking_string}\n.*?\n{end_thinking_string}\n{start_answer_string}\n.*?\n{end_answer_string}\n$"
            responses = [
                completion if isinstance(completion, str) else completion[0]["content"] for completion in completions
            ]
            matches = [re.match(pattern, r) for r in responses]
            return [0.5 if match else 0.0 for match in matches]

        def soft_format_reward_func(completions, **kwargs) -> list[float]:
            """Reward function that checks if the completion has a specific format."""
            pattern = rf"{start_thinking_string}.*?{end_thinking_string}\s*{start_answer_string}.*?{end_answer_string}"
            responses = [
                completion if isinstance(completion, str) else completion[0]["content"] for completion in completions
            ]
            matches = [re.match(pattern, r) for r in responses]
            return [0.5 if match else 0.0 for match in matches]

        def llm_judge_reward_func(prompts, completions, **kwargs) -> list[float]:
            """Reward function that uses an external LLM server (e.g. vLLM) as a judge.

            Sends each (prompt, completion) pair to an OpenAI-compatible
            /chat/completions endpoint and asks the judge model to rate the
            response quality on a 0.0–2.0 scale.
            """
            responses = [
                completion if isinstance(completion, str) else completion[0]["content"] for completion in completions
            ]
            rewards = []

            for prompt_text, response_text in zip(prompts, responses):
                prompt_str = prompt_text if isinstance(prompt_text, str) else prompt_text[-1]["content"]
                judge_query = llm_judge_prompt.format(prompt=prompt_str, completion=response_text)

                try:
                    resp = http_requests.post(
                        f"{llm_judge_server_url}/chat/completions",
                        json={
                            "model": llm_judge_model_name,
                            "messages": [
                                {
                                    "role": "system",
                                    "content": (
                                        "You are a precise scoring assistant. Respond with ONLY a single number."
                                    ),
                                },
                                {"role": "user", "content": judge_query},
                            ],
                            "temperature": 0.0,
                            "max_tokens": 16,
                        },
                        timeout=30,
                    )
                    resp.raise_for_status()
                    result = resp.json()
                    score_text = result["choices"][0]["message"]["content"].strip()
                    # Extract the first numeric value from the response
                    match = re.search(r"(\d+\.?\d*)", score_text)
                    if match:
                        score = float(match.group(1))
                        score = max(0.0, min(2.0, score))  # clamp to [0.0, 2.0]
                    else:
                        score = 0.0
                    rewards.append(score)
                except Exception as e:
                    lab.log(f"⚠️ LLM judge request failed: {e}")
                    rewards.append(0.0)

            return rewards

        lab.update_progress(40)

        # BitsAndBytes configuration
        lab.log("Configuring quantization...")
        use_bf16 = False
        compute_dtype = torch.bfloat16 if use_bf16 else torch.float16
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=compute_dtype,
        )

        # Load model and tokenizer
        lab.log("Loading model and tokenizer...")
        try:
            model, tokenizer = FastLanguageModel.from_pretrained(
                model_name=model_id,
                max_seq_length=max_seq_length,
                max_lora_rank=lora_rank,
                dtype=compute_dtype,
                quantization_config=bnb_config,
                use_cache=False,
                device_map="auto",
            )
            model.config.pretraining_tp = 1
            lab.log(f"✅ Model loaded: {model_id}")
        except Exception as e:
            lab.log(f"❌ Failed to load model: {e}")
            import traceback

            traceback.print_exc()
            lab.error("Training failed due to model loading error.")
            return {"status": "error", "error": str(e)}

        lab.update_progress(50)

        # Apply LoRA
        lab.log("Applying LoRA configuration...")
        model = FastLanguageModel.get_peft_model(
            model,
            r=lora_rank,
            target_modules=[
                "q_proj",
                "k_proj",
                "v_proj",
                "o_proj",
                "gate_proj",
                "up_proj",
                "down_proj",
            ],
            lora_alpha=lora_alpha,
            use_gradient_checkpointing="unsloth",
        )

        lab.update_progress(60)

        # Training run name
        today = time.strftime("%Y%m%d-%H%M%S")
        run_suffix = training_config.get("template_name", today)

        # GRPO training configuration
        lab.log("Setting up GRPO trainer...")
        args = GRPOConfig(
            output_dir=output_dir,
            logging_dir=os.path.join(output_dir, f"logs_{run_suffix}"),
            num_train_epochs=num_epochs,
            max_steps=max_steps,
            beta=beta,
            num_iterations=num_iterations_val,
            weight_decay=weight_decay,
            per_device_train_batch_size=batch_size,
            num_generations=max(2, batch_size),  # GRPO requires at least 2 generations per prompt
            gradient_accumulation_steps=2,
            gradient_checkpointing=True,
            optim="paged_adamw_32bit",
            logging_steps=10,
            save_strategy="epoch",
            learning_rate=learning_rate,
            bf16=use_bf16,
            fp16=not use_bf16,
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
            report_to="wandb" if training_config.get("log_to_wandb", True) else "none",
            resume_from_checkpoint=checkpoint if checkpoint else None,
        )

        # Create progress callback using lab
        progress_callback = LabCallback()

        # Initialize GRPO trainer
        trainer = GRPOTrainer(
            model=model,
            train_dataset=dataset,
            processing_class=tokenizer,
            reward_funcs=[
                xmlcount_reward_func,
                correctness_reward_func,
                int_reward_func,
                strict_format_reward_func,
                soft_format_reward_func,
            ]
            + ([llm_judge_reward_func] if llm_judge_enabled else []),
            args=args,
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
                        "training_type": "Unsloth GRPO with LoRA",
                        "model_name": training_config["model_name"],
                        "dataset": training_config["_config"]["dataset_name"],
                        "lora_r": training_config["_config"]["lora_r"],
                        "lora_alpha": training_config["_config"]["lora_alpha"],
                        "lora_dropout": training_config["_config"]["lora_dropout"],
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
            f.write("Training Type: GRPO (Group Relative Policy Optimization)\n")
            f.write(f"Training Duration: {training_duration}\n")
            f.write(f"Model: {training_config['model_name']}\n")
            f.write(f"Dataset: {training_config['_config']['dataset_name']}\n")
            f.write(f"LoRA Rank: {training_config['_config']['lora_r']}\n")
            f.write(f"LoRA Alpha: {training_config['_config']['lora_alpha']}\n")
            f.write(f"Completed at: {end_time}\n")

        final_model_path = lab.save_artifact(final_model_file, "final_model_summary.txt")
        lab.log(f"Saved final model summary: {final_model_path}")

        # Save training configuration as artifact
        config_file = os.path.join(output_dir, "training_config.json")
        with open(config_file, "w") as f:
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

        saved_path = lab.save_model(model_dir, name="unsloth_grpo_trained_model")
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
        lab.finish("Training completed successfully with Unsloth GRPO")

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(training_duration),
            "output_dir": output_dir,
            "saved_model_path": saved_path,
            "trainer_type": "Unsloth GRPO",
            "gpu_used": os.environ.get("CUDA_VISIBLE_DEVICES", "all"),
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
    print("🚀 Starting Unsloth GRPO training...")
    result = train_model()
    print("Training result:", result)
