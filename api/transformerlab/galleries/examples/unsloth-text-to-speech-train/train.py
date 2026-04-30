from unsloth import is_bfloat16_supported, FastLanguageModel, FastModel
import os
import torch
from datetime import datetime
import json
import numpy as np
import soundfile as sf

from transformers import (
    TrainingArguments,
    Trainer,
    TrainerCallback,
    TrainerControl,
    TrainerState,
)
from datasets import Audio
from snac import SNAC

from trainer import CsmAudioTrainer, OrpheusAudioTrainer

from lab import lab

# Login to huggingface
from huggingface_hub import login

if os.getenv("HF_TOKEN"):
    login(token=os.getenv("HF_TOKEN"))


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
        lab.log("🚀 Training started with Unsloth FastLanguageModel")
        self.training_started = True
        if state.max_steps and state.max_steps > 0:
            self.total_steps = state.max_steps
        else:
            # Estimate steps if not provided
            self.total_steps = 1000

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


def _decode_orpheus_audio(generated_ids, snac_model, device="cpu"):
    """
    Decode Orpheus tokens back to audio using SNAC codec.

    This follows the exact logic from the Unsloth Orpheus Colab notebook:
    1. Find the last occurrence of token 128257 (start-of-audio marker)
    2. Crop everything after it
    3. Remove token 128258 (end-of-speech)
    4. Subtract 128266 offset from all tokens
    5. Redistribute across 3 SNAC layers (7 codes per group)
    6. Decode with SNAC
    """
    token_to_find = 128257  # Start of audio / SOA marker
    token_to_remove = 128258  # End of speech
    CODE_TOKEN_OFFSET = 128266

    try:
        # Step 1: Find last occurrence of the start-of-audio token and crop after it
        token_indices = (generated_ids == token_to_find).nonzero(as_tuple=True)

        if len(token_indices[1]) > 0:
            last_occurrence_idx = token_indices[1][-1].item()
            cropped_tensor = generated_ids[:, last_occurrence_idx + 1 :]
        else:
            cropped_tensor = generated_ids

        # Step 2: Remove end-of-speech tokens from each row
        processed_rows = []
        for row in cropped_tensor:
            masked_row = row[row != token_to_remove]
            processed_rows.append(masked_row)

        # Step 3: Process each row into code lists
        code_lists = []
        for row in processed_rows:
            row_length = row.size(0)
            new_length = (row_length // 7) * 7
            trimmed_row = row[:new_length]
            # Subtract the offset to get raw SNAC codes
            trimmed_row = [t.item() - CODE_TOKEN_OFFSET for t in trimmed_row]
            code_lists.append(trimmed_row)

        if not code_lists or len(code_lists[0]) == 0:
            lab.log("⚠️  No audio tokens found in generated output")
            return None

        # Step 4: Redistribute codes across SNAC layers (matching Colab exactly)
        def redistribute_codes(code_list):
            layer_1 = []
            layer_2 = []
            layer_3 = []
            for i in range((len(code_list) + 1) // 7):
                layer_1.append(code_list[7 * i])
                layer_2.append(code_list[7 * i + 1] - 4096)
                layer_3.append(code_list[7 * i + 2] - (2 * 4096))
                layer_3.append(code_list[7 * i + 3] - (3 * 4096))
                layer_2.append(code_list[7 * i + 4] - (4 * 4096))
                layer_3.append(code_list[7 * i + 5] - (5 * 4096))
                layer_3.append(code_list[7 * i + 6] - (6 * 4096))
            codes = [
                torch.tensor(layer_1).unsqueeze(0),
                torch.tensor(layer_2).unsqueeze(0),
                torch.tensor(layer_3).unsqueeze(0),
            ]
            audio_hat = snac_model.decode(codes)
            return audio_hat

        # Step 5: Decode each code list
        my_samples = []
        for code_list in code_lists:
            samples = redistribute_codes(code_list)
            my_samples.append(samples)

        # Return the first sample as numpy array
        audio = my_samples[0].detach().squeeze().to("cpu").numpy()
        return audio

    except Exception as e:
        lab.log(f"⚠️  Error decoding Orpheus audio: {e}")
        import traceback

        traceback.print_exc()
        return None


def generate_audio_sample(
    model,
    processor,
    text,
    sampling_rate,
    output_path,
    device="cuda",
    model_architecture="OrpheusForConditionalGeneration",
    snac_model=None,
):
    """
    Generate a synthetic audio sample from text using the trained model.

    Args:
        model: The TTS model (already loaded)
        processor: The model's processor/tokenizer
        text: Text to synthesize
        sampling_rate: Audio sampling rate
        output_path: Path to save the audio file
        device: Device to use (cuda or cpu)
        model_architecture: The model architecture type
        snac_model: Pre-loaded SNAC model (for Orpheus). If None, one will be created.

    Returns:
        True if successful, False otherwise
    """
    try:
        with torch.no_grad():
            # Tokenize input text
            if model_architecture == "CsmForConditionalGeneration":
                # Enable fast inference mode (Unsloth optimization)
                FastModel.for_inference(model)

                # CSM generation following the Unsloth Colab notebook exactly:
                # Use processor() with "[speaker_id]text" format and output_audio=True
                speaker_id = 0
                inputs = processor(f"[{speaker_id}]{text}", add_special_tokens=True).to(device)

                # Generate audio directly - output_audio=True makes model return waveform
                audio_values = model.generate(
                    **inputs,
                    max_new_tokens=125,  # 125 tokens = ~10 seconds of audio
                    output_audio=True,
                )
                # audio_values[0] is the raw audio waveform when output_audio=True
                audio = audio_values[0].to(torch.float32).cpu().numpy()

            else:  # OrpheusForConditionalGeneration
                # Enable fast inference mode (Unsloth optimization)
                FastLanguageModel.for_inference(model)

                # Initialize SNAC model for decoding (on CPU to save GPU VRAM)
                if snac_model is None:
                    snac_model = SNAC.from_pretrained("hubertsiuzdak/snac_24khz")
                snac_model = snac_model.to("cpu")

                # Build Orpheus-style prompt with special tokens
                # Format: [SOH] [text_tokens] [EOT] [EOH]
                # SOH = 128259 (start_of_human)
                # EOT = 128009 (end_of_text)
                # EOH = 128260 (end_of_human)
                # PAD = 128263
                start_token = torch.tensor([[128259]], dtype=torch.int64)
                end_tokens = torch.tensor([[128009, 128260]], dtype=torch.int64)

                input_ids = processor(text, return_tensors="pt").input_ids
                modified_input_ids = torch.cat([start_token, input_ids, end_tokens], dim=1)

                # No padding needed for single prompt
                input_ids_device = modified_input_ids.to(device)
                attention_mask = torch.ones_like(input_ids_device)

                # Generate audio tokens
                generated_ids = model.generate(
                    input_ids=input_ids_device,
                    attention_mask=attention_mask,
                    max_new_tokens=1200,
                    do_sample=True,
                    temperature=0.6,
                    top_p=0.95,
                    repetition_penalty=1.1,
                    num_return_sequences=1,
                    eos_token_id=128258,
                    use_cache=True,
                )

                # Decode generated tokens to audio using the Colab's exact approach
                audio = _decode_orpheus_audio(generated_ids, snac_model, "cpu")
                if audio is None:
                    lab.log("⚠️  Failed to decode Orpheus audio")
                    return False

            # Normalize audio
            max_val = np.max(np.abs(audio))
            if max_val > 0:
                audio = audio / (max_val * 1.1)  # Add slight headroom

            # Clip to valid range
            audio = np.clip(audio, -1.0, 1.0)

            # Convert to int16 for WAV file
            audio_int16 = np.int16(audio * 32767)

            # Save as WAV file
            sf.write(output_path, audio_int16, sampling_rate)

            # Verify file was created and has content
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                return True
            else:
                lab.log(f"⚠️  Generated audio file is empty: {output_path}")
                return False

    except Exception as e:
        lab.log(f"⚠️  Error generating audio sample: {e}")
        import traceback

        traceback.print_exc()
        return False


def save_audio_samples(
    model_before,
    processor_before,
    model_after,
    processor_after,
    text_sample,
    sampling_rate,
    output_dir,
    device="cuda",
    model_architecture="OrpheusForConditionalGeneration",
    snac_model=None,
):
    """
    Generate and save before/after training audio samples.

    Args:
        model_before: Pre-trained model (before training)
        processor_before: Pre-trained model's processor
        model_after: Fine-tuned model (after training)
        processor_after: Fine-tuned model's processor
        text_sample: Sample text to synthesize
        sampling_rate: Audio sampling rate
        output_dir: Directory to save samples
        device: Device to use
        model_architecture: The model architecture type
        snac_model: Pre-loaded SNAC model (shared across calls to avoid reloading)

    Returns:
        Tuple of (before_audio_path, after_audio_path) or (None, None) if failed
    """
    os.makedirs(output_dir, exist_ok=True)

    before_audio_path = os.path.join(output_dir, "sample_before_training.wav")
    after_audio_path = os.path.join(output_dir, "sample_after_training.wav")

    lab.log(f"🎵 Generating audio samples with text: '{text_sample}'...")

    # Generate before training sample
    lab.log("Generating pre-trained model sample...")
    before_success = generate_audio_sample(
        model_before,
        processor_before,
        text_sample,
        sampling_rate,
        before_audio_path,
        device,
        model_architecture,
        snac_model=snac_model,
    )

    if before_success:
        file_size = os.path.getsize(before_audio_path)
        lab.log(f"✅ Generated before-training sample: {before_audio_path} ({file_size} bytes)")
    else:
        before_audio_path = None

    # Generate after training sample
    lab.log("Generating fine-tuned model sample...")
    after_success = generate_audio_sample(
        model_after,
        processor_after,
        text_sample,
        sampling_rate,
        after_audio_path,
        device,
        model_architecture,
        snac_model=snac_model,
    )

    if after_success:
        file_size = os.path.getsize(after_audio_path)
        lab.log(f"✅ Generated after-training sample: {after_audio_path} ({file_size} bytes)")
    else:
        after_audio_path = None

    return before_audio_path, after_audio_path


def train_model():
    """Train an audio model using unsloth."""

    # Configure GPU usage - use only GPU 0
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"

    try:
        # Initialize lab
        lab.init()

        # Get parameters from task configuration
        config = lab.get_config()

        # Extract parameters with defaults and ensure proper types
        model_name = config.get("model_name", "unsloth/orpheus-3b-0.1-ft")
        dataset = config.get("dataset", "bosonai/EmergentTTS-Eval")
        audio_column_name = config.get("audio_column_name", "audio")
        text_column_name = config.get("text_column_name", "text_to_synthesize")
        lora_alpha = int(config.get("lora_alpha", 32))
        lora_dropout = float(config.get("lora_dropout", 0.0))
        lora_r = int(config.get("lora_r", 16))
        maximum_sequence_length = int(config.get("maximum_sequence_length", 1024))
        max_grad_norm = float(config.get("max_grad_norm", 0.3))
        learning_rate = float(config.get("learning_rate", 5e-05))
        learning_rate_schedule = config.get("learning_rate_schedule", "linear")
        batch_size = int(config.get("batch_size", 1))
        num_train_epochs = float(config.get("num_train_epochs", 1))
        weight_decay = float(config.get("weight_decay", 0.0))
        adam_beta1 = float(config.get("adam_beta1", 0.9))
        adam_beta2 = float(config.get("adam_beta2", 0.999))
        adam_epsilon = float(config.get("adam_epsilon", 1e-08))
        sampling_rate = int(config.get("sampling_rate", 24000))
        max_steps = int(config.get("max_steps", -1))
        model_architecture = config.get("model_architecture", "OrpheusForConditionalGeneration")

        # Training configuration
        training_config = {
            "experiment_name": "unsloth-tts-training",
            "model_name": model_name,
            "dataset": dataset,
            "template_name": "unsloth-tts-demo",
            "output_dir": "./output",
            "log_to_wandb": False,
            "_config": {
                "dataset_name": dataset,
                "audio_column_name": audio_column_name,
                "text_column_name": text_column_name,
                "lora_alpha": lora_alpha,
                "lora_dropout": lora_dropout,
                "lora_r": lora_r,
                "maximum_sequence_length": maximum_sequence_length,
                "max_grad_norm": max_grad_norm,
                "learning_rate": learning_rate,
                "learning_rate_schedule": learning_rate_schedule,
                "batch_size": batch_size,
                "num_train_epochs": num_train_epochs,
                "weight_decay": weight_decay,
                "adam_beta1": adam_beta1,
                "adam_beta2": adam_beta2,
                "adam_epsilon": adam_epsilon,
                # "report_to": "wandb",
                "sampling_rate": sampling_rate,
                "max_steps": max_steps,
                "model_architecture": model_architecture,
                "device": "cuda" if torch.cuda.is_available() else "cpu",
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

            datasets = load_dataset(training_config["dataset"])
            dataset = datasets["train"]
            lab.log(f"Loaded dataset with {len(datasets['train'])} training examples.")

            if (
                training_config["_config"]["audio_column_name"] not in dataset.column_names
                or training_config["_config"]["text_column_name"] not in dataset.column_names
            ):
                lab.log(
                    f"Missing required columns: '{training_config['_config']['audio_column_name']}' and '{training_config['_config']['text_column_name']}'."
                )
                lab.error("Training failed due to missing dataset columns.")
                return {"status": "error", "error": "Missing required dataset columns."}

        except Exception as e:
            lab.log(f"❌ Failed to load dataset: {e}")
            lab.error("Training failed due to dataset loading error.")
            return {"status": "error", "error": str(e)}

        lab.log("Preparing dataset...")
        try:
            # Getting the speaker id is important for multi-speaker models and speaker consistency
            speaker_key = "source"
            if "source" not in dataset.column_names and "speaker_id" not in dataset.column_names:
                print('No speaker found, adding default "source" of 0 for all examples')
                new_column = ["0"] * len(dataset)
                dataset = dataset.add_column("source", new_column)
            elif "source" not in dataset.column_names and "speaker_id" in dataset.column_names:
                speaker_key = "speaker_id"

            dataset = dataset.cast_column(
                training_config["_config"]["audio_column_name"],
                Audio(sampling_rate=training_config["_config"]["sampling_rate"]),
            )
            max_audio_length = max(
                len(example[training_config["_config"]["audio_column_name"]]["array"]) for example in dataset
            )
        except Exception as e:
            lab.log(f"❌ Failed to prepare dataset: {e}")
            lab.error("Training failed due to dataset preparation error.")
            return {"status": "error", "error": str(e)}

        # Load model and tokenizer using
        lab.log("Loading model and tokenizer and trainer...")
        try:
            model_name = training_config["model_name"]
            context_length = training_config["_config"]["maximum_sequence_length"]
            device = training_config["_config"]["device"]
            lora_r = training_config["_config"]["lora_r"]
            lora_alpha = training_config["_config"]["lora_alpha"]
            lora_dropout = training_config["_config"]["lora_dropout"]
            sampling_rate = training_config["_config"]["sampling_rate"]
            max_seq_length = training_config["_config"]["maximum_sequence_length"]
            audio_column_name = training_config["_config"]["audio_column_name"]
            text_column_name = training_config["_config"]["text_column_name"]
            batch_size = training_config["_config"]["batch_size"]

            if training_config["_config"]["model_architecture"] == "CsmForConditionalGeneration":
                model_trainer = CsmAudioTrainer(
                    model_name=model_name,
                    speaker_key=speaker_key,
                    context_length=context_length,
                    device=device,
                    lora_r=lora_r,
                    lora_alpha=lora_alpha,
                    lora_dropout=lora_dropout,
                    sampling_rate=sampling_rate,
                    max_audio_length=max_audio_length,
                    audio_column_name=audio_column_name,
                    text_column_name=text_column_name,
                )

            elif training_config["_config"]["model_architecture"] == "OrpheusForConditionalGeneration":
                model_trainer = OrpheusAudioTrainer(
                    model_name=model_name,
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
                lab.log(
                    f"❌ Model architecture {training_config['_config']['model_architecture']} is not supported for audio training. Please use 'CsmForConditionalGeneration' or 'OrpheusForConditionalGeneration'."
                )
                lab.error("Training failed due to unsupported model architecture.")
                return {"status": "error", "error": "Unsupported model architecture."}

            model = model_trainer.model
            tokenizer = model_trainer.processor
        except Exception as e:
            lab.log(f"❌ Failed to load model: {e}")
            import traceback

            traceback.print_exc()
            lab.error("Training failed due to model loading error.")
            return {"status": "error", "error": str(e)}

        lab.log("Preprocessing dataset...")

        try:
            processed_ds = dataset.map(
                model_trainer.preprocess_dataset,
                remove_columns=dataset.column_names,
                desc="Preprocessing dataset",
            )

            processed_ds = processed_ds.filter(lambda x: x is not None)

            lab.log(f"Processed dataset length: {len(processed_ds)}")

        except Exception as e:
            lab.log(f"❌ Failed to preprocess dataset: {e}")
            lab.error("Training failed due to dataset preprocessing error.")
            return {"status": "error", "error": str(e)}

        lab.log("Setting up trainer...")
        try:
            progress_callback = LabCallback()

            trainer = Trainer(
                model=model,
                train_dataset=processed_ds,
                callbacks=[progress_callback],
                args=TrainingArguments(
                    logging_dir=f"{training_config['output_dir']}/logs",
                    num_train_epochs=training_config["_config"]["num_train_epochs"],
                    per_device_train_batch_size=training_config["_config"]["batch_size"],
                    gradient_accumulation_steps=2,
                    warmup_ratio=0.03,
                    max_steps=training_config["_config"]["max_steps"],
                    learning_rate=training_config["_config"]["learning_rate"],
                    fp16=not is_bfloat16_supported(),
                    bf16=is_bfloat16_supported(),
                    logging_steps=10,
                    optim="adamw_8bit",
                    save_strategy="epoch",
                    weight_decay=training_config["_config"]["weight_decay"],
                    lr_scheduler_type=training_config["_config"]["learning_rate_schedule"],
                    max_grad_norm=training_config["_config"]["max_grad_norm"],
                    adam_beta1=training_config["_config"]["adam_beta1"],
                    adam_beta2=training_config["_config"]["adam_beta2"],
                    adam_epsilon=training_config["_config"]["adam_epsilon"],
                    disable_tqdm=False,
                    seed=3407,
                    report_to="wandb" if training_config.get("log_to_wandb", True) else "none",
                    output_dir=training_config["output_dir"],
                    resume_from_checkpoint=checkpoint if checkpoint else None,
                    remove_unused_columns=False,
                ),
            )
            lab.log("Trainer setup complete.")

        except Exception as e:
            lab.log(f"❌ Failed to set up trainer: {e}")
            import traceback

            traceback.print_exc()
            lab.error("Training failed due to trainer setup error.")
            return {"status": "error", "error": str(e)}

        # Train the model
        lab.log("Starting training...")
        try:
            # Define both sample texts for audio generation
            default_sample_text = "Hello welcome to transformer lab, where we turn text into natural sounding speech"
            dataset_sample_text = None

            if len(dataset) > 0:
                try:
                    sample_data = dataset[0]
                    if training_config["_config"]["text_column_name"] in sample_data:
                        dataset_sample_text = sample_data[training_config["_config"]["text_column_name"]]
                        lab.log(f"Using dataset sample text: '{dataset_sample_text}'")
                except Exception:
                    lab.log("Could not extract dataset sample text")

            # We will generate 4 audio samples total:
            # 1. default_sample_text - before training
            # 2. dataset_sample_text - before training (if available)
            # 3. default_sample_text - after training
            # 4. dataset_sample_text - after training (if available)

            # Build list of (text, filename_prefix) pairs
            sample_texts = [("default", default_sample_text)]
            if dataset_sample_text:
                sample_texts.append(("dataset", dataset_sample_text))

            # Get the SNAC model from the trainer if it's an Orpheus model
            snac_model_ref = getattr(model_trainer, "snac_model", None)

            # Generate "before training" audio samples BEFORE training starts
            lab.log("📊 Generating before-training audio samples...")
            before_audio_paths = {}
            for label, text_to_generate in sample_texts:
                output_filename = f"sample_{label}_before_training.wav"
                output_path = os.path.join(training_config["output_dir"], output_filename)
                try:
                    generate_audio_sample(
                        model,
                        tokenizer,
                        text_to_generate,
                        training_config["_config"]["sampling_rate"],
                        output_path,
                        training_config["_config"]["device"],
                        training_config["_config"]["model_architecture"],
                        snac_model=snac_model_ref,
                    )
                    if os.path.exists(output_path) and os.path.getsize(output_path) > 44:
                        file_size = os.path.getsize(output_path)
                        lab.log(f"✅ Generated before-training ({label}): {output_path} ({file_size} bytes)")
                        before_audio_paths[label] = output_path
                    else:
                        lab.log(f"⚠️  Before-training audio ({label}) was empty or failed")
                except Exception as e:
                    lab.log(f"⚠️  Could not generate before-training audio ({label}): {e}")

            # Now run training
            trainer.train()
            lab.log("✅ Training completed successfully")

            # Save the fine-tuned model
            lab.log("Saving fine-tuned model...")
            model.save_pretrained(training_config["output_dir"])
            tokenizer.save_pretrained(training_config["output_dir"])
            lab.log("✅ Model and tokenizer saved")

            # Generate "after training" audio samples AFTER training completes
            lab.log("📊 Generating after-training audio samples...")
            after_audio_paths = {}
            for label, text_to_generate in sample_texts:
                output_filename = f"sample_{label}_after_training.wav"
                output_path = os.path.join(training_config["output_dir"], output_filename)
                try:
                    # Re-fetch snac_model_ref in case it was moved during training
                    snac_model_ref = getattr(model_trainer, "snac_model", None)

                    generate_audio_sample(
                        model,
                        tokenizer,
                        text_to_generate,
                        training_config["_config"]["sampling_rate"],
                        output_path,
                        training_config["_config"]["device"],
                        training_config["_config"]["model_architecture"],
                        snac_model=snac_model_ref,
                    )
                    if os.path.exists(output_path) and os.path.getsize(output_path) > 44:
                        file_size = os.path.getsize(output_path)
                        lab.log(f"✅ Generated after-training ({label}): {output_path} ({file_size} bytes)")
                        after_audio_paths[label] = output_path
                    else:
                        lab.log(f"⚠️  After-training audio ({label}) was empty or failed")
                except Exception as e:
                    lab.log(f"⚠️  Could not generate after-training audio ({label}): {e}")

            # Save all audio samples as artifacts
            try:
                for label, path in before_audio_paths.items():
                    if os.path.exists(path):
                        artifact_name = f"sample_{label}_before_training.wav"
                        artifact_path = lab.save_artifact(path, artifact_name)
                        lab.log(f"✅ Saved artifact: {artifact_path}")

                for label, path in after_audio_paths.items():
                    if os.path.exists(path):
                        artifact_name = f"sample_{label}_after_training.wav"
                        artifact_path = lab.save_artifact(path, artifact_name)
                        lab.log(f"✅ Saved artifact: {artifact_path}")

            except Exception as e:
                lab.log(f"⚠️  Could not save audio artifacts: {e}")
                import traceback

                traceback.print_exc()

            # Create training summary artifact
            progress_file = os.path.join(training_config["output_dir"], "training_summary.json")

            with open(progress_file, "w") as f:
                json.dump(
                    {
                        "training_type": "Unsloth FastLanguageModel with LoRA",
                        "model_name": training_config["model_name"],
                        "dataset": training_config["dataset"],
                        "lora_r": training_config["_config"]["lora_r"],
                        "lora_alpha": training_config["_config"]["lora_alpha"],
                        "lora_dropout": training_config["_config"]["lora_dropout"],
                        "max_seq_length": training_config["_config"]["maximum_sequence_length"],
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

        end_time = datetime.now()
        training_duration = end_time - start_time
        lab.log(f"Training completed in {training_duration}")

        # Save final artifacts
        final_model_file = os.path.join(training_config["output_dir"], "final_model_summary.txt")
        with open(final_model_file, "w") as f:
            f.write("Final Model Summary\n")
            f.write("==================\n")
            f.write(f"Training Duration: {training_duration}\n")
            f.write(f"Model: {training_config['model_name']}\n")
            f.write(f"Dataset: {training_config['dataset']}\n")
            f.write(f"LoRA Rank: {training_config['_config']['lora_r']}\n")
            f.write(f"LoRA Alpha: {training_config['_config']['lora_alpha']}\n")
            f.write(f"Completed at: {end_time}\n")

        final_model_path = lab.save_artifact(final_model_file, "final_model_summary.txt")
        lab.log(f"Saved final model summary: {final_model_path}")

        # Save training configuration as artifact
        config_file = os.path.join(training_config["output_dir"], "training_config.json")
        with open(config_file, "w") as f:
            json.dump(training_config, f, indent=2)

        config_artifact_path = lab.save_artifact(config_file, "training_config.json")
        lab.log(f"Saved training config: {config_artifact_path}")

        # Save the trained model
        model_dir = os.path.join(training_config["output_dir"], "final_model")
        os.makedirs(model_dir, exist_ok=True)

        # Copy model files to final_model directory
        import shutil

        for file in os.listdir(training_config["output_dir"]):
            if file.endswith((".bin", ".safetensors", ".json", ".txt")) and not file.startswith("checkpoint"):
                src = os.path.join(training_config["output_dir"], file)
                dst = os.path.join(model_dir, file)
                if os.path.isfile(src):
                    shutil.copy2(src, dst)

        saved_path = lab.save_model(model_dir, name="unsloth_trained_model")
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
        lab.finish("Training completed successfully with Unsloth")

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(training_duration),
            "output_dir": training_config["output_dir"],
            "saved_model_path": saved_path,
            "trainer_type": "Unsloth TTS Trainer",
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
    print("🚀 Starting Unsloth training...")
    result = train_model()
    print("Training result:", result)
