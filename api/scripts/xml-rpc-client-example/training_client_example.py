import os
from datetime import datetime
from pprint import pprint

from datasets import load_dataset
from transformerlab_client.callbacks.hf_callback import TLabProgressCallback
from transformerlab_client.client import TransformerLabClient
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
)


def train():
    """Main training function that runs locally but reports to TransformerLab"""

    # Training configuration
    training_config = {
        "experiment_name": "alpha",
        "model_name": "HuggingFaceTB/SmolLM-135M-Instruct",
        "dataset": "Trelis/touch-rugby-rules",
        "template_name": "full-demo",
        "output_dir": "./output",
        "log_to_wandb": False,
        "_config": {
            "dataset_name": "Trelis/touch-rugby-rules",
            "lr": 2e-5,
            "num_train_epochs": 1,
            "batch_size": 8,
            "gradient_accumulation_steps": 1,
            "warmup_ratio": 0.03,
            "weight_decay": 0.01,
            "max_seq_length": 512,
        },
    }

    # Initialize TransformerLab client
    tlab_client = TransformerLabClient()
    job_id = tlab_client.start(training_config)

    # Create output directory if it doesn't exist
    os.makedirs(training_config["output_dir"], exist_ok=True)

    try:
        # Log start time
        start_time = datetime.now()
        tlab_client.log_info(f"Training started at {start_time}")

        # Load the dataset
        tlab_client.log_info("Loading dataset...")
        dataset = load_dataset(training_config["dataset"])
        tlab_client.log_info(f"Loaded dataset with {len(dataset['train'])} training examples")

        # Report progress to TransformerLab
        tlab_client.report_progress(10, {"status": "dataset_loaded"})

        # Load tokenizer and model
        tlab_client.log_info(f"Loading model: {training_config['model_name']}")
        tokenizer = AutoTokenizer.from_pretrained(training_config["model_name"])
        model = AutoModelForCausalLM.from_pretrained(
            training_config["model_name"],
            device_map="auto",
        )

        # Configure tokenizer
        if not tokenizer.pad_token_id:
            tokenizer.pad_token = tokenizer.eos_token

        # Report progress
        tlab_client.report_progress(20, {"status": "model_loaded"})

        # Process dataset
        def format_instruction(example):
            """Format instruction and response using template"""
            instruction = example["prompt"]
            response = example["completion"]

            # Simple Llama-3 instruction template
            if training_config["template_name"] == "llama3instruct":
                formatted = (
                    f"<|begin_of_text|><|prompt|>{instruction}<|response|>{response}<|end_of_text|>"
                )
            else:
                # Default simple template
                formatted = f"Instruction: {instruction}\n\nResponse: {response}"

            return {"formatted_text": formatted}

        tokenized_dataset = dataset.map(format_instruction)

        # Tokenize dataset
        def tokenize_function(examples):
            return tokenizer(
                examples["formatted_text"],
                padding="max_length",
                truncation=True,
                max_length=training_config["_config"]["max_seq_length"],
                return_tensors="pt",
            )

        processed_dataset = tokenized_dataset.map(
            tokenize_function, batched=True, remove_columns=tokenized_dataset["train"].column_names
        )

        # Report progress
        tlab_client.report_progress(30, {"status": "dataset_processed"})

        # Setup training arguments
        training_args = TrainingArguments(
            output_dir=os.path.join(training_config["output_dir"], f"job_{job_id}"),
            learning_rate=training_config["_config"]["lr"],
            num_train_epochs=training_config["_config"]["num_train_epochs"],
            per_device_train_batch_size=training_config["_config"]["batch_size"],
            gradient_accumulation_steps=training_config["_config"]["gradient_accumulation_steps"],
            warmup_ratio=training_config["_config"]["warmup_ratio"],
            weight_decay=training_config["_config"]["weight_decay"],
            logging_steps=20,
            save_steps=500,
            save_total_limit=2,
            report_to=[],  # We'll handle reporting to TransformerLab ourselves
        )

        # Setup trainer
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=processed_dataset["train"],
            data_collator=DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False),
            callbacks=[TLabProgressCallback(tlab_client)],
        )

        # Train the model
        tlab_client.log_info("Starting training...")
        trainer.train()

        # Save the final model
        tlab_client.log_info("Saving model...")
        trainer.save_model(os.path.join(training_config["output_dir"], f"final_model_{job_id}"))
        tokenizer.save_pretrained(
            os.path.join(training_config["output_dir"], f"final_model_{job_id}")
        )
        tlab_client.log_info("Saving model in Transformer Lab")
        tlab_client.save_model(os.path.join(training_config["output_dir"], f"final_model_{job_id}"))

        # Calculate training time
        end_time = datetime.now()
        training_duration = end_time - start_time
        tlab_client.log_info(f"Training completed in {training_duration}")

        # Complete the job in TransformerLab
        tlab_client.complete()

        return {
            "status": "success",
            "job_id": job_id,
            "duration": str(training_duration),
            "output_dir": os.path.join(training_config["output_dir"], f"final_model_{job_id}"),
        }

    except KeyboardInterrupt:
        tlab_client.log_warning("Training interrupted by user or remotely")
        tlab_client.stop("Training stopped by user or remotely")
        return {"status": "stopped", "job_id": job_id}

    except Exception as e:
        tlab_client.log_error(f"Training failed: {e!s}")
        import traceback

        traceback.print_exc()
        tlab_client.stop(f"Training failed: {e!s}")
        return {"status": "error", "job_id": job_id, "error": str(e)}


if __name__ == "__main__":
    result = train()
    pprint(result)
