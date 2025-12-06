from abc import ABC, abstractmethod

import torch
from snac import SNAC
from transformers import AutoProcessor, CsmForConditionalGeneration
from unsloth import FastLanguageModel, FastModel


class AudioTrainerBase(ABC):
    def __init__(
        self,
        model_name,
        context_length,
        device,
        speaker_key,
        lora_r,
        lora_alpha,
        lora_dropout,
        sampling_rate,
        max_audio_length,
        audio_column_name="audio",
        text_column_name="text",
    ):
        self.model_name = model_name
        self.context_length = context_length
        self.device = device
        self.speaker_key = speaker_key
        self.lora_r = lora_r
        self.lora_alpha = lora_alpha
        self.lora_dropout = lora_dropout
        self.sampling_rate = sampling_rate
        self.max_audio_length = max_audio_length
        self.audio_column_name = audio_column_name
        self.text_column_name = text_column_name
        self.lora_target_modules = [
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ]

    @abstractmethod
    def preprocess_dataset(self, example):
        pass


class CsmAudioTrainer(AudioTrainerBase):
    def __init__(
        self,
        model_name,
        context_length,
        device,
        speaker_key,
        lora_r,
        lora_alpha,
        lora_dropout,
        sampling_rate,
        max_audio_length,
        audio_column_name="audio",
        text_column_name="text",
    ):
        super().__init__(
            model_name,
            context_length,
            device,
            speaker_key,
            lora_r,
            lora_alpha,
            lora_dropout,
            sampling_rate,
            max_audio_length,
            audio_column_name,
            text_column_name,
        )
        self.model, self.tokenizer = FastModel.from_pretrained(
            model_name=self.model_name,
            max_seq_length=self.context_length,
            dtype=None,  # Leave as None for auto-detection
            auto_model=CsmForConditionalGeneration,
            load_in_4bit=False,  # Keep this set to False because voice models are small, so we can maintain high quality results.
        )
        self.processor = AutoProcessor.from_pretrained(self.model_name)
        self.model = FastModel.get_peft_model(
            self.model,
            r=lora_r,
            target_modules=self.lora_target_modules,
            lora_alpha=lora_alpha,
            lora_dropout=lora_dropout,
            bias="none",  # Supports any, but = "none" is optimized
            use_gradient_checkpointing="unsloth",  # True or "unsloth" for very long context
            random_state=3407,
            use_rslora=False,  # We support rank stabilized LoRA
            loftq_config=None,  # And LoftQ
        )
        num_trainable = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        print(f"Trainable parameters: {num_trainable}")

    def preprocess_dataset(self, example):
        conversation = [
            {
                "role": str(example[self.speaker_key]),
                "content": [
                    {"type": "text", "text": example[self.text_column_name]},
                    {"type": "audio", "path": example[self.audio_column_name]["array"]},
                ],
            }
        ]

        try:
            model_inputs = self.processor.apply_chat_template(
                conversation,
                tokenize=True,
                return_dict=True,
                output_labels=True,
                text_kwargs={
                    "padding": "max_length",  # pad to the max_length
                    "max_length": self.context_length,  # this should be the max length of audio
                    "pad_to_multiple_of": 8,  # Pad so length is a multiple of 8 (for efficiency)
                    "padding_side": "right",
                },
                audio_kwargs={
                    "sampling_rate": self.sampling_rate,
                    "max_length": self.max_audio_length,  # max input_values length of the whole dataset
                    "padding": "max_length",
                },
                common_kwargs={"return_tensors": "pt"},
            )
        except Exception as e:
            print(
                f"Error processing example with text '{example[self.text_column_name][:50]}...': {e}"
            )
            return None

        required_keys = [
            "input_ids",
            "attention_mask",
            "labels",
            "input_values",
            "input_values_cutoffs",
        ]
        processed_example = {}
        for key in required_keys:
            if key not in model_inputs:
                print(f"Warning: Required key '{key}' not found in processor output for example.")
                return None

            value = model_inputs[key][0]
            processed_example[key] = value

        if not all(isinstance(processed_example[key], torch.Tensor) for key in processed_example):
            print(
                f"Error: Not all required keys are tensors in final processed example. Keys: {list(processed_example.keys())}"
            )
            return None

        return processed_example


class OrpheusAudioTrainer(AudioTrainerBase):
    def __init__(
        self,
        model_name,
        context_length,
        device,
        speaker_key,
        lora_r,
        lora_alpha,
        lora_dropout,
        sampling_rate,
        max_audio_length,
        batch_size,
        audio_column_name="audio",
        text_column_name="text",
    ):
        super().__init__(
            model_name,
            context_length,
            device,
            speaker_key,
            lora_r,
            lora_alpha,
            lora_dropout,
            sampling_rate,
            max_audio_length,
            audio_column_name,
            text_column_name,
        )
        self.snac_model = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").to(self.device)
        self.model, self.processor = FastLanguageModel.from_pretrained(
            model_name=self.model_name,
            max_seq_length=self.context_length,
            dtype=None,
            load_in_4bit=False,
        )

        self.model = FastLanguageModel.get_peft_model(
            self.model,
            r=lora_r,
            target_modules=self.lora_target_modules,
            lora_alpha=lora_alpha,
            lora_dropout=lora_dropout,
            bias="none",  # Supports any, but = "none" is optimized
            use_gradient_checkpointing="unsloth",  # True or "unsloth" for very long context
            random_state=3407,
            use_rslora=False,  # We support rank stabilized LoRA
            loftq_config=None,  # And LoftQ
        )
        num_trainable = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        print(f"Trainable parameters: {num_trainable}")

        # Define special tokens
        self.tokenizer_length = 128256
        self.start_of_text = 128000
        self.end_of_text = 128009
        self.start_of_speech = self.tokenizer_length + 1
        self.end_of_speech = self.tokenizer_length + 2
        self.start_of_human = self.tokenizer_length + 3
        self.end_of_human = self.tokenizer_length + 4
        self.start_of_ai = self.tokenizer_length + 5
        self.end_of_ai = self.tokenizer_length + 6
        self.audio_tokens_start = self.tokenizer_length + 10
        self.pad_token = self.tokenizer_length + 7
        self.ds_sample_rate = 24000
        self.batch_size = batch_size

    def _tokenize_audio(self, waveform):
        """Convert audio waveform to SNAC tokens."""
        waveform = torch.from_numpy(waveform).unsqueeze(0)
        waveform = waveform.to(dtype=torch.float32)

        waveform = waveform.unsqueeze(0).to(self.device)

        # Generate SNAC codes
        with torch.inference_mode():
            codes = self.snac_model.encode(waveform)

        # Interleave codes according to Orpheus format
        all_codes = []
        for i in range(codes[0].shape[1]):
            all_codes.extend(
                [
                    codes[0][0][i].item() + 128266,
                    codes[1][0][2 * i].item() + 128266 + 4096,
                    codes[2][0][4 * i].item() + 128266 + (2 * 4096),
                    codes[2][0][(4 * i) + 1].item() + 128266 + (3 * 4096),
                    codes[1][0][(2 * i) + 1].item() + 128266 + (4 * 4096),
                    codes[2][0][(4 * i) + 2].item() + 128266 + (5 * 4096),
                    codes[2][0][(4 * i) + 3].item() + 128266 + (6 * 4096),
                ]
            )

        return all_codes

    def _remove_duplicate_frames(self, codes_list):
        """Remove consecutive duplicate audio frames to reduce redundancy."""
        if len(codes_list) % 7 != 0:
            raise ValueError("Input list length must be divisible by 7")

        result = codes_list[:7]

        for i in range(7, len(codes_list), 7):
            current_first = codes_list[i]
            previous_first = result[-7]

            if current_first != previous_first:
                result.extend(codes_list[i : i + 7])

        return result

    def preprocess_dataset(self, example):
        """
        Preprocess a single example for Orpheus training.
        """
        try:
            # Extract and tokenize audio
            audio_array = example[self.audio_column_name]["array"]
            codes_list = self._tokenize_audio(audio_array)

            if not codes_list:
                print(
                    f"Warning: Empty codes list for example with text '{example[self.text_column_name][:50]}...'"
                )
                return None

            # Remove duplicate frames for efficiency
            codes_list = self._remove_duplicate_frames(codes_list)

            # Create text prompt (multi-speaker or single-speaker)
            if example.get(self.speaker_key):
                text_prompt = f"{example[self.speaker_key]}: {example[self.text_column_name]}"
            else:
                text_prompt = example[self.text_column_name]

            text_ids = self.processor.encode(text_prompt, add_special_tokens=True)
            text_ids.append(self.end_of_text)

            # Construct input sequence with special tokens
            input_ids = (
                [self.start_of_human]
                + text_ids
                + [self.end_of_human]
                + [self.start_of_ai]
                + [self.start_of_speech]
                + codes_list
                + [self.end_of_speech]
                + [self.end_of_ai]
            )

            # Use tokenizer to handle truncation and padding properly
            if len(input_ids) > self.context_length:
                input_ids = input_ids[: self.context_length]

            labels = input_ids.copy()

            # Pad to context_length using the pad_token
            padding_length = self.context_length - len(input_ids)
            if padding_length > 0 and self.batch_size > 1:
                input_ids.extend([self.pad_token] * padding_length)
                labels.extend([-100] * padding_length)
                attention_mask = [1] * (len(input_ids) - padding_length) + [0] * padding_length
            else:
                attention_mask = [1] * len(input_ids)

            return {"input_ids": input_ids, "labels": labels, "attention_mask": attention_mask}

        except Exception as e:
            print(
                f"Error processing example with text '{example[self.text_column_name][:50]}...': {e}"
            )
            return None
