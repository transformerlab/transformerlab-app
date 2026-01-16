import os
import subprocess
import time
from random import randrange
import torch.nn as nn
from functools import partial
import asyncio


from transformerlab.sdk.v1.train import tlab_trainer
from transformerlab.plugin import get_python_executable, format_template
from lab.dirs import get_workspace_dir
from lab import storage


# Add custom arguments
tlab_trainer.add_argument(
    "--launched_with_accelerate", action="store_true", help="Flag to prevent recursive subprocess launching"
)


def find_lora_target_modules(model, keyword="proj"):
    """
    Returns all submodule names (e.g., 'q_proj') suitable for LoRA injection.
    These can be passed directly to LoraConfig as `target_modules`.
    """
    module_names = set()
    for name, module in model.named_modules():
        if isinstance(module, nn.Linear) and keyword in name:
            # Keep full relative module name, excluding the root prefix (e.g., "model.")
            cleaned_name = ".".join(name.split(".")[1:]) if name.startswith("model.") else name
            module_names.add(cleaned_name.split(".")[-1])  # Use just the relative layer name
    return sorted(module_names)


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

    if python_path:
        paths_to_include.append(python_path)

    env["PYTHONPATH"] = ":".join(paths_to_include)
    return env


@tlab_trainer.job_wrapper()
def train_model():
    """Main training function using TrainerTLabPlugin"""
    # Get configuration from tlab_trainer
    # Configuration is loaded automatically when tlab_trainer methods are called
    datasets = tlab_trainer.load_dataset()
    dataset = datasets["train"]

    formatting_template = tlab_trainer.params.get("formatting_template", None)
    chat_template = tlab_trainer.params.get("formatting_chat_template", None)
    chat_column = tlab_trainer.params.get("chatml_formatted_column", "messages")

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
        ]
        if gpu_ids:
            cmd.extend(["--gpu_ids", gpu_ids])

        result = subprocess.run(cmd, env=env)
        print(f"Subprocess completed with return code: {result.returncode}")
        return

    # Import dependencies after the subprocess check
    import torch
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, AutoConfig
    from trl import SFTConfig, SFTTrainer
    from accelerate import Accelerator

    # Initialize Accelerator
    accelerator = Accelerator()
    print(f"Running with accelerate on {accelerator.num_processes} processes")

    # use_flash_attention = False

    # Get model info
    model_id = tlab_trainer.params.model_name

    print(f"dataset size: {len(dataset)}")
    print(dataset[randrange(len(dataset))])

    # Model configuration
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    # Load model
    device_map = None if accelerator.num_processes > 1 else "auto"
    try:
        model = AutoModelForCausalLM.from_pretrained(
            model_id, quantization_config=bnb_config, use_cache=False, device_map=device_map, trust_remote_code=True
        )
        lora_target_modules = find_lora_target_modules(model)
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(
            model_id,
            quantization_config=bnb_config,
            device_map=device_map,
            trust_remote_code=True,
        )
        lora_target_modules = find_lora_target_modules(model)
    except Exception as e:
        print(f"Model loading error: {str(e)}")
        raise e

    model.config.pretraining_tp = 1
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    # Setup chat template and formatting function
    formatting_func = partial(
        format_template,
        chat_template=chat_template,
        formatting_template=formatting_template,
        tokenizer=tokenizer,
        chat_column=chat_column,
    )
    print("Formatted example:")
    print(formatting_func(dataset[randrange(len(dataset))]))

    # LoRA config
    peft_config = LoraConfig(
        lora_alpha=int(tlab_trainer.params.lora_alpha),
        lora_dropout=float(tlab_trainer.params.lora_dropout),
        r=int(tlab_trainer.params.lora_r),
        bias="none",
        task_type="CAUSAL_LM",
    )

    # Prepare model
    model = prepare_model_for_kbit_training(model)
    try:
        model = get_peft_model(model, peft_config)
    except ValueError as e:
        print(f"PEFT model preparation error: {str(e)}")
        peft_config = LoraConfig(
            lora_alpha=int(tlab_trainer.params.lora_alpha),
            lora_dropout=float(tlab_trainer.params.lora_dropout),
            r=int(tlab_trainer.params.lora_r),
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=lora_target_modules,
        )
        model = get_peft_model(model, peft_config)

    # Training configuration
    output_dir = tlab_trainer.params.get("output_dir", "./output")

    # Setup WandB - decorator would handle this check
    today = time.strftime("%Y%m%d-%H%M%S")
    run_suffix = tlab_trainer.params.get("template_name", today)

    args = SFTConfig(
        output_dir=output_dir,
        logging_dir=storage.join(output_dir, f"job_{tlab_trainer.params.job_id}_{run_suffix}"),
        num_train_epochs=int(tlab_trainer.params.num_train_epochs),
        per_device_train_batch_size=int(tlab_trainer.params.batch_size),
        gradient_accumulation_steps=2,
        gradient_checkpointing=True,
        optim="paged_adamw_32bit",
        logging_steps=10,
        save_strategy="epoch",
        learning_rate=float(tlab_trainer.params.learning_rate),
        bf16=True,
        tf32=False,  # T4 GPUs do not support tf32
        max_grad_norm=0.3,
        warmup_ratio=0.03,
        lr_scheduler_type=tlab_trainer.params.learning_rate_schedule,
        disable_tqdm=False,
        packing=True,
        run_name=f"job_{tlab_trainer.params.job_id}_{run_suffix}",
        report_to=tlab_trainer.report_to,
        ddp_find_unused_parameters=False,
        dataloader_pin_memory=True,
        no_cuda=False,
        do_eval=True,
        load_best_model_at_end=False,
        metric_for_best_model="loss",
        greater_is_better=False,
        eval_strategy="epoch",
        completion_only_loss=False,
    )

    # Create progress callback
    callback = tlab_trainer.create_progress_callback() if hasattr(tlab_trainer, "create_progress_callback") else None
    callbacks = [callback] if callback else []

    # Setup evaluation dataset - use 10% of the data if enough examples
    if len(dataset) >= 10:
        split_dataset = dataset.train_test_split(test_size=0.1)
        train_data = split_dataset["train"]
        eval_data = split_dataset["test"]
    else:
        train_data = dataset
        eval_data = None

    # Create trainer
    trainer = SFTTrainer(
        model=model,
        train_dataset=train_data,
        eval_dataset=eval_data,
        peft_config=peft_config,
        processing_class=tokenizer,
        formatting_func=formatting_func,
        args=args,
        callbacks=callbacks,
    )

    # Train model
    trainer.train()

    # Save model
    trainer.save_model(output_dir=tlab_trainer.params.adaptor_output_dir)

    if tlab_trainer.params.get("fuse_model", False):
        # Merge the model with the adaptor
        try:
            model_config = AutoConfig.from_pretrained(model_id, trust_remote_code=True)
            model_architecture = model_config.architectures[0]
            # Load the base model again
            try:
                model = AutoModelForCausalLM.from_pretrained(
                    model_id,
                    quantization_config=bnb_config,
                    use_cache=False,
                    device_map=None,
                    trust_remote_code=True,
                )
            except TypeError:
                model = AutoModelForCausalLM.from_pretrained(
                    model_id,
                    quantization_config=bnb_config,
                    device_map=None,
                    trust_remote_code=True,
                )
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
            model.to(device)
            if "/" in model_id:
                model_id = model_id.split("/")[-1]
            adaptor_name = tlab_trainer.params.get("adaptor_name", "default")
            fused_model_name = f"{model_id}_{adaptor_name}"
            workspace_dir = asyncio.run(get_workspace_dir())
            fused_model_location = storage.join(workspace_dir, "models", fused_model_name)
            peft_model = PeftModel.from_pretrained(model, tlab_trainer.params.adaptor_output_dir)
            merged_model = peft_model.merge_and_unload()
            merged_model.save_pretrained(fused_model_location)
            tokenizer.save_pretrained(fused_model_location)
            print(f"Model saved successfully to {fused_model_location}")
            json_data = {
                "description": f"A model trained and generated by Transformer Lab based on {tlab_trainer.params.model_name}"
            }
            tlab_trainer.create_transformerlab_model(fused_model_name, model_architecture, json_data)

        except Exception as e:
            print(f"Model merging error: {str(e)}")

    # Return success message
    return "Adaptor trained successfully"


train_model()
