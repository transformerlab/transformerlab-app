import time
import os
from random import randrange
import asyncio

import torch
import shutil
from functools import partial

HAS_AMD = False
if shutil.which("rocminfo") is not None:
    HAS_AMD = True
    # AMD-specific optimizations
    os.environ["PYTORCH_HIP_ALLOC_CONF"] = "max_split_size_mb:128"
    os.environ["HIP_VISIBLE_DEVICES"] = "0"
    # Disable some problematic CUDA-specific features
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
if torch.cuda.is_available():
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"

from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel  # noqa: E402
from transformers import AutoModelForCausalLM, AutoTokenizer, AutoConfig, Mxfp4Config  # noqa: E402
from trl import SFTConfig, SFTTrainer  # noqa: E402
import torch.nn as nn  # noqa: E402


from transformerlab.plugin import format_template  # noqa: E402
from lab.dirs import get_workspace_dir  # noqa: E402
from lab import storage  # noqa: E402
from transformerlab.sdk.v1.train import tlab_trainer  # noqa: E402


def find_lora_target_modules(model, keyword="proj", model_name=None):
    """
    Returns all submodule names (e.g., 'q_proj') suitable for LoRA injection.
    These can be passed directly to LoraConfig as `target_modules`.
    """
    if model_name is not None and "gpt-oss" in model_name:
        return "all-linear"
    module_names = set()
    for name, module in model.named_modules():
        if isinstance(module, nn.Linear) and keyword in name:
            # Keep full relative module name, excluding the root prefix (e.g., "model.")
            cleaned_name = ".".join(name.split(".")[1:]) if name.startswith("model.") else name
            module_names.add(cleaned_name.split(".")[-1])  # Use just the relative layer name
    return sorted(module_names)


@tlab_trainer.job_wrapper()
def train_model():
    # Configuration is loaded automatically when tlab_trainer methods are called
    datasets = tlab_trainer.load_dataset()
    dataset = datasets["train"]

    print(f"Dataset loaded successfully with {len(dataset)} examples")
    print(dataset[randrange(len(dataset))])

    formatting_template = tlab_trainer.params.get("formatting_template", None)
    chat_template = tlab_trainer.params.get("formatting_chat_template", None)
    chat_column = tlab_trainer.params.get("chatml_formatted_column", "messages")

    # Load model
    model_id = tlab_trainer.params.model_name

    # Setup quantization
    if not HAS_AMD:
        if "gpt-oss" in model_id:
            print("Training GPT-OSS model is only supported for GPUs with compute capability 9.0 or higher.")
            quantization_config = Mxfp4Config(dequantize=True)
            print("The model is dequantized during loading. Please ensure you have enough VRAM for loading the model.")

        else:
            from transformers import BitsAndBytesConfig

            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
            )

    # AMD-specific memory management
    if HAS_AMD:
        torch.cuda.empty_cache()
        if torch.cuda.is_available():
            torch.cuda.synchronize()

    model_kwargs = {
        "use_cache": False,
        "device_map": "auto",
        "trust_remote_code": True,
    }

    # Set model kwargs
    if not HAS_AMD:
        model_kwargs["quantization_config"] = quantization_config
        if "gpt-oss" in model_id:
            model_kwargs["torch_dtype"] = torch.bfloat16
            model_kwargs["attn_implementation"] = "eager"
    else:
        model_kwargs["torch_dtype"] = torch.float16

    try:
        if not HAS_AMD:
            model = AutoModelForCausalLM.from_pretrained(
                model_id,
                **model_kwargs,
            )
        else:
            model = AutoModelForCausalLM.from_pretrained(
                model_id,
                **model_kwargs,
            )
        lora_target_modules = find_lora_target_modules(model, model_name=model_id)
        model.config.pretraining_tp = 1

        tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.padding_side = "right"

        print(f"Model and tokenizer loaded successfully: {model_id}")
    except TypeError:
        del model_kwargs["use_cache"]
        if not HAS_AMD:
            model = AutoModelForCausalLM.from_pretrained(
                model_id,
                **model_kwargs,
            )
        else:
            model = AutoModelForCausalLM.from_pretrained(
                model_id,
                **model_kwargs,
            )
        lora_target_modules = find_lora_target_modules(model, model_name=model_id)
        model.config.pretraining_tp = 1

        tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.padding_side = "right"
    except Exception as e:
        print(f"Model loading error: {str(e)}")
        raise

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

    # Setup LoRA - use direct attribute access with safe defaults
    lora_alpha = int(tlab_trainer.params.get("lora_alpha", 16))
    lora_dropout = float(tlab_trainer.params.get("lora_dropout", 0.05))
    lora_r = int(tlab_trainer.params.get("lora_r", 8))

    peft_config = LoraConfig(
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        r=lora_r,
        bias="none",
        task_type="CAUSAL_LM",
    )

    # Prepare model for training
    if not HAS_AMD:
        model = prepare_model_for_kbit_training(model)
    try:
        model = get_peft_model(model, peft_config)
    except ValueError as e:
        print(f"PEFT model preparation error: {str(e)}")
        peft_config = LoraConfig(
            lora_alpha=lora_alpha,
            lora_dropout=lora_dropout,
            r=lora_r,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=lora_target_modules,
        )
        model = get_peft_model(model, peft_config)

    num_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Trainable parameters: {num_trainable}")

    # Get output directories - use direct attribute access
    output_dir = tlab_trainer.params.get("output_dir", "./output")
    adaptor_output_dir = tlab_trainer.params.get("adaptor_output_dir", "./adaptor")

    # Setup training arguments - use direct attribute access
    num_train_epochs = int(tlab_trainer.params.get("num_train_epochs", 3))
    batch_size = int(tlab_trainer.params.get("batch_size", 4))

    learning_rate = float(tlab_trainer.params.get("learning_rate", 2e-4))
    lr_scheduler = tlab_trainer.params.get("learning_rate_schedule", "constant")

    today = time.strftime("%Y%m%d-%H%M%S")
    run_suffix = tlab_trainer.params.get("template_name", today)

    if not HAS_AMD:
        # Setup training configuration
        training_args = SFTConfig(
            output_dir=output_dir,
            logging_dir=storage.join(output_dir, f"job_{tlab_trainer.params.job_id}_{run_suffix}"),
            num_train_epochs=num_train_epochs,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=2,
            gradient_checkpointing=True,
            optim="paged_adamw_32bit",
            logging_steps=10,
            save_strategy="epoch",
            learning_rate=learning_rate,
            bf16=True,
            tf32=False,  # T4 GPUs do not support tf32
            max_grad_norm=0.3,
            warmup_ratio=0.03,
            lr_scheduler_type=lr_scheduler,
            disable_tqdm=False,
            packing=True,
            run_name=f"job_{tlab_trainer.params.job_id}_{run_suffix}",
            report_to=tlab_trainer.report_to,
            do_eval=True,
            load_best_model_at_end=True,
            metric_for_best_model="loss",
            greater_is_better=False,
            eval_strategy="epoch",
            completion_only_loss=False,
        )
    else:
        # Setup training configuration for AMD
        training_args = SFTConfig(
            output_dir=output_dir,
            logging_dir=storage.join(output_dir, f"job_{tlab_trainer.params.job_id}_{run_suffix}"),
            num_train_epochs=num_train_epochs,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=2,
            optim="adamw_torch",
            logging_steps=10,
            save_strategy="epoch",
            learning_rate=learning_rate,
            fp16=True,
            max_grad_norm=0.3,
            warmup_ratio=0.03,
            lr_scheduler_type=lr_scheduler,
            disable_tqdm=False,
            packing=False,  # Disable packing for AMD compatibility
            run_name=f"job_{tlab_trainer.params.job_id}_{run_suffix}",
            report_to=tlab_trainer.report_to,
            eval_strategy="epoch",
            do_eval=True,
            load_best_model_at_end=True,
            metric_for_best_model="loss",
            greater_is_better=False,
            completion_only_loss=False,
            dataloader_pin_memory=False,  # Disable pin memory for AMD
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
        processing_class=tokenizer,
        formatting_func=formatting_func,
        args=training_args,
        callbacks=callbacks,
    )

    # Train the model
    try:
        trainer.train()
        print("Training completed successfully")
    except Exception as e:
        print(f"Training error: {str(e)}")
        raise

    # Save the model
    try:
        trainer.save_model(output_dir=adaptor_output_dir)
        print(f"Model saved successfully to {adaptor_output_dir}")
    except Exception as e:
        print(f"Model saving error: {str(e)}")
        raise

    if tlab_trainer.params.get("fuse_model", False):
        # Merge the model with the adaptor
        try:
            model_config = AutoConfig.from_pretrained(model_id, trust_remote_code=True)
            model_architecture = model_config.architectures[0]
            # Load the base model again
            try:
                if HAS_AMD:
                    model = AutoModelForCausalLM.from_pretrained(
                        model_id,
                        use_cache=False,
                        torch_dtype=torch.float16,
                        device_map="auto",
                        trust_remote_code=True,
                    )
                else:
                    model = AutoModelForCausalLM.from_pretrained(
                        model_id,
                        use_cache=False,
                        device_map="auto",
                        trust_remote_code=True,
                    )
            except TypeError:
                if HAS_AMD:
                    model = AutoModelForCausalLM.from_pretrained(
                        model_id,
                        torch_dtype=torch.float16,
                        device_map="auto",
                        trust_remote_code=True,
                    )
                else:
                    model = AutoModelForCausalLM.from_pretrained(
                        model_id,
                        device_map="auto",
                        trust_remote_code=True,
                    )

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
            tlab_trainer.create_transformerlab_model(
                fused_model_name, model_architecture, json_data, parent_model=tlab_trainer.params.model_name
            )

        except Exception as e:
            print(f"Model merging error: {str(e)}")


train_model()
