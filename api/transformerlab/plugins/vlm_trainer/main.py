from transformerlab.sdk.v1.train import tlab_trainer
import os
import torch
from lab.dirs import get_workspace_dir
from lab import storage
import asyncio

if torch.cuda.is_available():
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"
from random import randrange
from jinja2 import Environment

from peft import LoraConfig, PeftModel
from transformers import AutoModelForVision2Seq, AutoProcessor, BitsAndBytesConfig, Qwen2VLProcessor, AutoConfig
from trl import SFTConfig, SFTTrainer
from qwen_vl_utils import process_vision_info

jinja_environment = Environment()


@tlab_trainer.job_wrapper()
def train_vlm():
    # Inspired by Phil Schmid's TRL Script: https://github.com/philschmid/deep-learning-pytorch-huggingface/blob/main/training/fine-tune-multimodal-llms-with-trl.ipynb

    print("Training VLM...")
    # Load dataset using tlab_trainer
    datasets = tlab_trainer.load_dataset()
    dataset = datasets["train"]

    print(f"Dataset loaded successfully with {len(dataset)} examples")
    print(dataset[randrange(len(dataset))])

    # Setup template for formatting
    input_template = getattr(tlab_trainer.params, "input_template", "")
    output_template = getattr(tlab_trainer.params, "output_template", "")
    system_prompt = getattr(tlab_trainer.params, "instruction_template", "")

    input_template_jinja = jinja_environment.from_string(input_template)

    output_template_jinja = jinja_environment.from_string(output_template)

    system_prompt_jinja = jinja_environment.from_string(system_prompt)

    image_col = getattr(tlab_trainer.params, "image_col_name", "")

    def format_data(sample):
        # Render each template with the sample as context
        rendered_system = system_prompt_jinja.render(sample)
        rendered_input = input_template_jinja.render(sample)
        rendered_output = output_template_jinja.render(sample)

        user_content = [{"type": "text", "text": rendered_input}]
        if image_col and image_col != "":
            user_content.append({"type": "image", "image": sample[image_col]})

        return {
            "messages": [
                {
                    "role": "system",
                    "content": [{"type": "text", "text": rendered_system}],
                },
                {
                    "role": "user",
                    "content": user_content,
                },
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": rendered_output}],
                },
            ]
        }

    # Convert dataset to OAI messages
    dataset = [format_data(sample) for sample in dataset]

    print("Formatted example:")
    print(dataset[randrange(len(dataset))])

    # Model and processor
    model_id = tlab_trainer.params.get("model_name")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    model = AutoModelForVision2Seq.from_pretrained(
        model_id,
        device_map="auto",
        torch_dtype=torch.bfloat16,
        quantization_config=bnb_config,
        trust_remote_code=True,
    )
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

    # LoRA config
    lora_alpha = int(tlab_trainer.params.get("lora_alpha", 16))
    lora_dropout = float(tlab_trainer.params.get("lora_dropout", 0.05))
    lora_r = int(tlab_trainer.params.get("lora_r", 8))
    peft_config = LoraConfig(
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        r=lora_r,
        bias="none",
        target_modules=["q_proj", "v_proj"],
        task_type="CAUSAL_LM",
    )

    # SFTConfig
    output_dir = tlab_trainer.params.get("output_dir", "./")
    adaptor_output_dir = tlab_trainer.params.get("adaptor_output_dir", "./adaptor")
    num_train_epochs = int(tlab_trainer.params.get("num_train_epochs", 3))
    batch_size = int(tlab_trainer.params.get("batch_size", 4))
    learning_rate = float(tlab_trainer.params.get("learning_rate", 2e-4))
    lr_scheduler = tlab_trainer.params.get("learning_rate_schedule", "constant")

    args = SFTConfig(
        output_dir=output_dir,
        num_train_epochs=num_train_epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=8,
        gradient_checkpointing=True,
        optim="adamw_torch_fused",
        logging_steps=10,
        save_strategy="epoch",
        learning_rate=learning_rate,
        bf16=True,
        tf32=True,
        max_grad_norm=0.3,
        warmup_ratio=0.03,
        lr_scheduler_type=lr_scheduler,
        report_to=tlab_trainer.report_to,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        dataset_kwargs={"skip_prepare_dataset": True},
    )
    args.remove_unused_columns = False

    # Collator
    def collate_fn(examples):
        texts = [processor.apply_chat_template(example["messages"], tokenize=False) for example in examples]
        image_inputs = [process_vision_info(example["messages"])[0] for example in examples]
        batch = processor(text=texts, images=image_inputs, return_tensors="pt", padding=True)
        labels = batch["input_ids"].clone()
        labels[labels == processor.tokenizer.pad_token_id] = -100
        if isinstance(processor, Qwen2VLProcessor):
            image_tokens = [151652, 151653, 151655]
        else:
            image_tokens = [processor.tokenizer.convert_tokens_to_ids(processor.image_token)]
        for image_token_id in image_tokens:
            labels[labels == image_token_id] = -100
        batch["labels"] = labels
        return batch

    # Progress callback
    progress_callback = tlab_trainer.create_progress_callback(framework="huggingface")

    # Trainer
    trainer = SFTTrainer(
        model=model,
        args=args,
        train_dataset=dataset,
        data_collator=collate_fn,
        peft_config=peft_config,
        processing_class=processor.tokenizer,
        callbacks=[progress_callback],
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

    # Optionally merge LoRA adapter
    if tlab_trainer.params.get("fuse_model", False):
        try:
            model_config = AutoConfig.from_pretrained(model_id, trust_remote_code=True)
            model_architecture = model_config.architectures[0]
            model = AutoModelForVision2Seq.from_pretrained(
                model_id,
                device_map="auto",
                torch_dtype=torch.bfloat16,
                quantization_config=bnb_config,
                trust_remote_code=True,
            )
            if "/" in model_id:
                model_id_short = model_id.split("/")[-1]
            else:
                model_id_short = model_id
            adaptor_name = tlab_trainer.params.get("adaptor_name", "default")
            fused_model_name = f"{model_id_short}_{adaptor_name}"
            workspace_dir = asyncio.run(get_workspace_dir())
            fused_model_location = storage.join(workspace_dir, "models", fused_model_name)
            peft_model = PeftModel.from_pretrained(model, args.adaptor_output_dir)
            merged_model = peft_model.merge_and_unload()
            merged_model.save_pretrained(fused_model_location)
            processor.tokenizer.save_pretrained(fused_model_location)
            print(f"Model saved successfully to {fused_model_location}")
            json_data = {"description": f"A VLM trained and generated by Transformer Lab based on {model_id}"}
            tlab_trainer.create_transformerlab_model(fused_model_name, model_architecture, json_data)
        except Exception as e:
            print(f"Model merging error: {str(e)}")


train_vlm()
