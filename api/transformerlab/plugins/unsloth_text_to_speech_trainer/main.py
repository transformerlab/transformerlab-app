import time

import torch
from datasets import Audio
from lab import storage
from trainer import CsmAudioTrainer, OrpheusAudioTrainer
from transformerlab.sdk.v1.train import tlab_trainer
from transformers import Trainer, TrainingArguments
from unsloth import is_bfloat16_supported


@tlab_trainer.job_wrapper(wandb_project_name="TLab_Training", manual_logging=True)
def train_model():
    # Configuration is loaded automatically when tlab_trainer methods are called
    datasets = tlab_trainer.load_dataset()
    dataset = datasets["train"]

    # Get configurable column names
    audio_column_name = tlab_trainer.params.get("audio_column_name", "audio")
    text_column_name = tlab_trainer.params.get("text_column_name", "text")

    if (
        audio_column_name not in dataset.column_names
        or text_column_name not in dataset.column_names
    ):
        raise ValueError(
            f"Missing required columns: '{audio_column_name}' and '{text_column_name}'. "
            "Please update the column names in the Plugin Config."
        )
    # Get configuration values
    lora_alpha = int(tlab_trainer.params.get("lora_alpha", 16))
    lora_dropout = float(tlab_trainer.params.get("lora_dropout", 0))
    lora_r = int(tlab_trainer.params.get("lora_r", 8))
    model_id = tlab_trainer.params.model_name

    max_seq_length = int(tlab_trainer.params.maximum_sequence_length)
    learning_rate = float(tlab_trainer.params.learning_rate)
    learning_rate_schedule = tlab_trainer.params.get("learning_rate_schedule", "constant")
    max_grad_norm = float(tlab_trainer.params.max_grad_norm)
    batch_size = int(tlab_trainer.params.batch_size)
    num_epochs = int(tlab_trainer.params.num_train_epochs)
    weight_decay = float(tlab_trainer.params.weight_decay)
    adam_beta1 = float(tlab_trainer.params.adam_beta1)
    adam_beta2 = float(tlab_trainer.params.adam_beta2)
    adam_epsilon = float(tlab_trainer.params.adam_epsilon)
    output_dir = tlab_trainer.params.output_dir
    report_to = tlab_trainer.report_to
    sampling_rate = int(tlab_trainer.params.get("sampling_rate", 24000))
    max_steps = int(tlab_trainer.params.get("max_steps", -1))
    model_architecture = tlab_trainer.params.get("model_architecture")
    device = "cuda" if torch.cuda.is_available() else "cpu"

    # Getting the speaker id is important for multi-speaker models and speaker consistency
    speaker_key = "source"
    if "source" not in dataset.column_names and "speaker_id" not in dataset.column_names:
        print('No speaker found, adding default "source" of 0 for all examples')
        new_column = ["0"] * len(dataset)
        dataset = dataset.add_column("source", new_column)
    elif "source" not in dataset.column_names and "speaker_id" in dataset.column_names:
        speaker_key = "speaker_id"

    dataset = dataset.cast_column(audio_column_name, Audio(sampling_rate=sampling_rate))
    max_audio_length = max(len(example[audio_column_name]["array"]) for example in dataset)

    if model_architecture == "CsmForConditionalGeneration":
        model_trainer = CsmAudioTrainer(
            model_name=model_id,
            speaker_key=speaker_key,
            context_length=max_seq_length,
            device=device,
            lora_r=lora_r,
            lora_alpha=lora_alpha,
            lora_dropout=lora_dropout,
            sampling_rate=sampling_rate,
            max_audio_length=max_audio_length,
            audio_column_name=audio_column_name,
            text_column_name=text_column_name,
        )
    elif "orpheus" in model_id:
        model_trainer = OrpheusAudioTrainer(
            model_name=model_id,
            speaker_key=speaker_key,
            context_length=max_seq_length,
            device=device,
            lora_r=lora_r,
            lora_alpha=lora_alpha,
            lora_dropout=lora_dropout,
            sampling_rate=sampling_rate,
            max_audio_length=max_audio_length,
            batch_size=batch_size,
            audio_column_name=audio_column_name,
            text_column_name=text_column_name,
        )
    else:
        raise ValueError(
            f"Model architecture {model_architecture} is not supported for audio training."
        )

    processed_ds = dataset.map(
        model_trainer.preprocess_dataset,
        remove_columns=dataset.column_names,
        desc="Preprocessing dataset",
    )

    processed_ds = processed_ds.filter(lambda x: x is not None)

    print(f"Processed dataset length: {len(processed_ds)}")

    # Create progress callback using tlab_trainer
    progress_callback = tlab_trainer.create_progress_callback(framework="huggingface")

    # Training run name
    today = time.strftime("%Y%m%d-%H%M%S")
    run_suffix = tlab_trainer.params.get("template_name", today)
    trainer = Trainer(
        model=model_trainer.model,
        train_dataset=processed_ds,
        callbacks=[progress_callback],
        args=TrainingArguments(
            logging_dir=storage.join(output_dir, f"job_{tlab_trainer.params.job_id}_{run_suffix}"),
            num_train_epochs=num_epochs,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=2,
            warmup_ratio=0.03,
            max_steps=max_steps,
            learning_rate=learning_rate,
            fp16=not is_bfloat16_supported(),
            bf16=is_bfloat16_supported(),
            logging_steps=10,
            optim="adamw_8bit",
            save_strategy="epoch",
            weight_decay=weight_decay,
            lr_scheduler_type=learning_rate_schedule,
            max_grad_norm=max_grad_norm,
            adam_beta1=adam_beta1,
            adam_beta2=adam_beta2,
            adam_epsilon=adam_epsilon,
            disable_tqdm=False,
            seed=3407,
            output_dir=output_dir,
            run_name=f"job_{tlab_trainer.params.job_id}_{run_suffix}",
            report_to=report_to,
        ),
    )
    # Train the model
    try:
        trainer.train()
    except Exception as e:
        raise e

    # Save the model
    try:
        trainer.save_model(output_dir=tlab_trainer.params.adaptor_output_dir)
    except Exception as e:
        raise e

    # Return success message
    return "Audio model trained successfully."


train_model()
