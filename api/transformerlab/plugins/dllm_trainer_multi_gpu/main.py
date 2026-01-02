import os
import subprocess
import asyncio
from functools import partial

from transformerlab.sdk.v1.train import tlab_trainer
from transformerlab.plugin import get_python_executable
from lab.dirs import get_workspace_dir

# Add custom arguments
tlab_trainer.add_argument(
    "--launched_with_accelerate", action="store_true", help="Flag to prevent recursive subprocess launching"
)
tlab_trainer.add_argument("--training_method", type=str, default="bert", help="Training method: bert, dream, or llada")


def setup_accelerate_environment():
    """Set up the environment for the accelerate launch subprocess"""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    plugin_dir = os.path.dirname(os.path.realpath(__file__))
    api_dir = os.path.abspath(os.path.join(current_dir, "../../.."))
    env = os.environ.copy()
    python_executable = get_python_executable(plugin_dir)
    env["PATH"] = python_executable.replace("/python", ":") + env["PATH"]
    tlab_source_dir = os.environ.get("_TFL_SOURCE_CODE_DIR")
    python_path = env.get("PYTHONPATH", "")
    paths_to_include = [api_dir]

    if tlab_source_dir:
        tlabab_sdk_path = os.path.join(tlab_source_dir, "transformerlab", "plugin_sdk")
        paths_to_include.append(tlabab_sdk_path)
        plugin_parent = os.path.join(tlab_source_dir, "transformerlab")
        paths_to_include.append(plugin_parent)

    # Add dllm to PYTHONPATH
    # dllm is cloned into the plugin directory by setup.sh
    dllm_dir = os.path.join(plugin_dir, "dllm")
    if os.path.exists(dllm_dir):
        paths_to_include.append(dllm_dir)

    if python_path:
        paths_to_include.append(python_path)

    env["PYTHONPATH"] = ":".join(paths_to_include)
    return env


@tlab_trainer.job_wrapper()
def train_model():
    """Main training function using dllm for SFT training"""
    print("STARTING THIS TRAIN")
    # Get configuration from tlab_trainer
    datasets = tlab_trainer.load_dataset()
    dataset = datasets["train"]

    from random import randrange

    print(dataset[randrange(len(dataset))])

    # Get training method
    training_method = tlab_trainer.params.get("training_method", "bert")
    print(f"Training method: {training_method}")
    if training_method not in ["bert", "dream", "llada"]:
        raise ValueError(f"training_method must be one of: bert, dream, llada. Got: {training_method}")

    # Set up accelerate configuration
    accelerate_config = {
        "cuda": "multi_gpu",
        "cpu": "cpu",
        "tpu": "tpu",
    }

    train_device = accelerate_config.get(tlab_trainer.params.train_device, "multi_gpu")
    print(f"Training setup for accelerate launch: {train_device}")

    # Configure GPU IDs
    gpu_ids = None
    if train_device == "multi_gpu":
        gpu_ids = tlab_trainer.params.gpu_ids
        if gpu_ids and gpu_ids != "auto":
            gpu_ids = str(gpu_ids)
        if gpu_ids == "auto":
            gpu_ids = None

    # Check if we need to launch with accelerate
    if not tlab_trainer.params.get("launched_with_accelerate", False):
        print("Launching training with accelerate for multi-GPU...")
        env = setup_accelerate_environment()

        cmd = [
            "accelerate",
            "launch",
            f"--{train_device}",
            __file__,
            "--input_file",
            tlab_trainer.params.input_file,
            "--launched_with_accelerate",
            "--training_method",
            training_method,
        ]
        if gpu_ids:
            cmd.extend(["--gpu_ids", gpu_ids])

        result = subprocess.run(cmd, env=env)
        print(f"Subprocess completed with return code: {result.returncode}")
        return

    # Import dependencies after the subprocess check
    import accelerate
    from accelerate import Accelerator
    from jinja2 import Environment
    from dllm.utils import ModelArguments, DataArguments, TrainingArguments
    from dllm.utils import get_model, get_tokenizer, print_args_main, initial_training_setup
    from dllm.utils.data_utils import default_sft_map_fn, post_process_dataset, NoAttentionMaskCollator
    from datasets import DatasetDict

    # Initialize Accelerator
    accelerator = Accelerator()
    print(f"Running with accelerate on {accelerator.num_processes} processes")

    # Get model info
    model_id = tlab_trainer.params.model_name

    # Create dataclass instances for dllm
    model_args = ModelArguments(
        model_name_or_path=model_id,
        dtype=tlab_trainer.params.get("dtype", "bfloat16"),
        load_in_4bit=tlab_trainer.params.get("load_in_4bit", False),
        lora=tlab_trainer.params.get("lora", False),
        target_modules=tlab_trainer.params.get("target_modules", "all-linear"),
        r=tlab_trainer.params.get("lora_r", 32),
        lora_alpha=tlab_trainer.params.get("lora_alpha", 64),
        lora_dropout=tlab_trainer.params.get("lora_dropout", 0.05),
        bias=tlab_trainer.params.get("bias", "none"),
    )

    data_args = DataArguments(
        dataset_args="",  # We'll use the dataset from tlab_trainer
        num_proc=tlab_trainer.params.get("num_proc", 8),
        max_length=tlab_trainer.params.get("max_length", 1024),
        truncation=tlab_trainer.params.get("truncation", "right"),
    )
    # Store mask_prompt_loss separately since it's not in DataArguments
    mask_prompt_loss = tlab_trainer.params.get("mask_prompt_loss", True)

    output_dir = tlab_trainer.params.get("output_dir", "./output")
    raw_num_train_epochs = tlab_trainer.params.get("num_train_epochs", 0)
    try:
        parsed_num_train_epochs = int(raw_num_train_epochs)
    except (TypeError, ValueError) as exc:
        raise ValueError("num_train_epochs must be an integer.") from exc

    train_steps_param = tlab_trainer.params.get("train_steps", tlab_trainer.params.get("max_steps"))
    use_train_steps = parsed_num_train_epochs <= 0

    training_args_kwargs = dict(
        output_dir=output_dir,
        per_device_train_batch_size=int(tlab_trainer.params.batch_size),
        per_device_eval_batch_size=int(tlab_trainer.params.batch_size),
        learning_rate=float(tlab_trainer.params.learning_rate),
        lr_scheduler_type=tlab_trainer.params.get("learning_rate_schedule", "cosine"),
        warmup_ratio=tlab_trainer.params.get("warmup_ratio", 0.1),
        bf16=tlab_trainer.params.get("bf16", True),
        logging_steps=tlab_trainer.params.get("logging_steps", 10),
        eval_strategy=tlab_trainer.params.get("eval_strategy", "steps"),
        eval_steps=tlab_trainer.params.get("eval_steps", 0.25),
        save_steps=tlab_trainer.params.get("save_steps", 0.25),
        report_to=tlab_trainer.report_to,
        seed=tlab_trainer.params.get("seed", 42),
        gradient_accumulation_steps=tlab_trainer.params.get("gradient_accumulation_steps", 1),
    )

    if use_train_steps:
        if train_steps_param is None:
            raise ValueError("train_steps must be provided when num_train_epochs is 0.")
        try:
            max_steps = int(train_steps_param)
        except (TypeError, ValueError) as exc:
            raise ValueError("train_steps must be an integer when num_train_epochs is 0.") from exc
        if max_steps <= 0:
            raise ValueError("train_steps must be a positive integer when num_train_epochs is 0.")
        training_args_kwargs["max_steps"] = max_steps
    else:
        training_args_kwargs["num_train_epochs"] = parsed_num_train_epochs

    training_args = TrainingArguments(**training_args_kwargs)

    print_args_main(model_args, data_args, training_args)
    initial_training_setup(model_args, data_args, training_args)

    # Load model and tokenizer
    with accelerate.PartialState().local_main_process_first():
        model = get_model(model_args=model_args)
        tokenizer = get_tokenizer(model_args=model_args)

    # Prepare dataset
    # Convert transformerlab dataset to format expected by dllm
    # dllm expects a dataset with "messages" column
    jinja_environment = Environment()

    # Get the template strings from params (similar to GRPO trainer)
    input_template_str = tlab_trainer.params.get("input_template", "")
    output_template_str = tlab_trainer.params.get("output_template", "")
    instruction_template = tlab_trainer.params.get("instruction_template", "")

    # Create Jinja2 templates from template strings (only input and output are Jinja templates)
    input_template = jinja_environment.from_string(input_template_str) if input_template_str else None
    output_template = jinja_environment.from_string(output_template_str) if output_template_str else None

    def format_instruction(template, mapping):
        """Helper function to format instruction using Jinja2 template (similar to GRPO trainer)"""
        if template is None:
            return ""
        return template.render(mapping)

    def convert_to_messages(row):
        # Check if dataset already has messages format
        if "messages" in row and row["messages"]:
            return row

        messages = []

        # Use templates if provided (similar to GRPO trainer's format_instructions)
        if input_template_str or output_template_str:
            # Add system message if instruction_template is provided (used directly, not as Jinja template)
            if instruction_template:
                messages.append({"role": "system", "content": instruction_template})

            # Format user message using input_template (Jinja template)
            user_content = format_instruction(input_template, row) if input_template_str else ""
            if user_content:
                messages.append({"role": "user", "content": user_content})

            # Format assistant message using output_template (Jinja template)
            assistant_content = format_instruction(output_template, row) if output_template_str else ""
            if assistant_content:
                messages.append({"role": "assistant", "content": assistant_content})

        # Fallback to original logic if templates are not provided or result is empty
        if not messages or (len(messages) == 1 and messages[0].get("role") == "system"):
            messages = []
            if "instruction" in row and "output" in row:
                if "input" in row and row["input"]:
                    messages.append({"role": "user", "content": f"{row['instruction']}\n{row['input']}"})
                else:
                    messages.append({"role": "user", "content": row["instruction"]})
                messages.append({"role": "assistant", "content": row["output"]})
            elif "prompt" in row and "completion" in row:
                messages.append({"role": "user", "content": row["prompt"]})
                messages.append({"role": "assistant", "content": row["completion"]})
            elif "text" in row:
                # Try to parse as a simple text format
                text = row["text"]
                # Basic heuristic: if it contains common instruction markers, try to split
                if "\n\n" in text:
                    parts = text.split("\n\n", 1)
                    if len(parts) == 2:
                        messages.append({"role": "user", "content": parts[0]})
                        messages.append({"role": "assistant", "content": parts[1]})
                    else:
                        messages.append({"role": "user", "content": text})
                else:
                    messages.append({"role": "user", "content": text})
            else:
                # Fallback: create a simple message
                messages.append({"role": "user", "content": str(row)})

        return {"messages": messages}

    # Convert to DatasetDict format expected by dllm
    if not isinstance(dataset, DatasetDict):
        # Create eval split if we have enough data
        if len(dataset) >= 10:
            split_dataset = dataset.train_test_split(test_size=0.1, seed=42)
            dataset = DatasetDict({"train": split_dataset["train"], "test": split_dataset["test"]})
        else:
            dataset = DatasetDict({"train": dataset})

    # Convert to messages format
    columns_to_remove = [col for col in dataset["train"].column_names if col != "messages"]
    if columns_to_remove:
        dataset = dataset.map(convert_to_messages, remove_columns=columns_to_remove)
    else:
        dataset = dataset.map(convert_to_messages)

    # Process dataset with dllm
    with accelerate.PartialState().local_main_process_first():
        # Check if load_preprocessed_data attribute exists, default to False if not
        load_preprocessed_data = getattr(data_args, "load_preprocessed_data", False)
        if not load_preprocessed_data:
            map_fn = partial(
                default_sft_map_fn,
                tokenizer=tokenizer,
                mask_prompt_loss=mask_prompt_loss,
            )
            dataset = dataset.map(map_fn, num_proc=data_args.num_proc)
        # truncate / filter long sequences if needed
        dataset = post_process_dataset(dataset, data_args)

    # Wait for all processes
    accelerate.PartialState().wait_for_everyone()

    # Create trainer based on method
    print(f"Using {training_method} training method")

    if training_method == "bert":
        from dllm.core.trainers import MDLMTrainer

        trainer = MDLMTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=dataset["train"],
            eval_dataset=dataset.get("test", None),
            args=training_args,
            data_collator=NoAttentionMaskCollator(
                tokenizer,
                return_tensors="pt",
                padding=True,
                label_pad_token_id=tokenizer.pad_token_id,
            ),
        )
    elif training_method == "dream":
        from dllm.pipelines.dream import DreamTrainer
        from dllm.pipelines.dream.utils import DreamSFTCollator

        # Dream-specific parameters
        perbatch_cutoff = tlab_trainer.params.get("perbatch_cutoff", True)
        resp_cutoff_ratio = tlab_trainer.params.get("resp_cutoff_ratio", 0.0)
        loss_weight_type = tlab_trainer.params.get("loss_weight_type", "cart[geo_p:0.3]")

        trainer = DreamTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=dataset["train"],
            eval_dataset=dataset.get("test", None),
            args=training_args,
            loss_weight_type=loss_weight_type,
            data_collator=DreamSFTCollator(
                tokenizer,
                return_tensors="pt",
                padding=True,
                perbatch_cutoff=perbatch_cutoff,
                resp_cutoff_ratio=resp_cutoff_ratio,
            ),
        )
    elif training_method == "llada":
        from dllm.core.trainers import MDLMTrainer

        trainer = MDLMTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=dataset["train"],
            eval_dataset=dataset.get("test", None),
            args=training_args,
            data_collator=NoAttentionMaskCollator(
                tokenizer,
                return_tensors="pt",
                padding=True,
                label_pad_token_id=tokenizer.pad_token_id,
            ),
        )

    # Create progress callback
    callback = tlab_trainer.create_progress_callback() if hasattr(tlab_trainer, "create_progress_callback") else None
    if callback:
        trainer.add_callback(callback)

    # Train model
    trainer.train()

    if accelerator.is_main_process:
        is_lora = bool(tlab_trainer.params.get("lora", False))

        if is_lora:
            # Save adaptor model
            adaptor_output_dir = getattr(tlab_trainer.params, "adaptor_output_dir", None)
            if adaptor_output_dir:
                trainer.save_model(output_dir=adaptor_output_dir)
                trainer.processing_class.save_pretrained(adaptor_output_dir)
        else:
            if "/" in model_id:
                model_id_short = model_id.split("/")[-1]
            else:
                model_id_short = model_id

            adaptor_name = tlab_trainer.params.get("adaptor_name", "default")
            fused_model_name = f"{model_id_short}_{adaptor_name}"
            workspace_dir = asyncio.run(get_workspace_dir())
            fused_model_location = os.path.join(workspace_dir, "models", fused_model_name)

            trainer.save_model(output_dir=fused_model_location)
            if hasattr(trainer, "processing_class") and trainer.processing_class:
                trainer.processing_class.save_pretrained(fused_model_location)
            model_config = getattr(trainer.model, "config", None)
            if model_config and getattr(model_config, "architectures", None):
                model_architecture = model_config.architectures[0]
            else:
                model_architecture = type(trainer.model).__name__
            json_data = {
                "description": f"A model trained and generated by Transformer Lab based on {tlab_trainer.params.model_name}"
            }
            tlab_trainer.create_transformerlab_model(fused_model_name, model_architecture, json_data)

        return "Training completed successfully"


train_model()
