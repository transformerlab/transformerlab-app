from abc import ABC, abstractmethod

import librosa
import torch
from snac import SNAC
from transformers import AutoProcessor, CsmForConditionalGeneration
from unsloth import FastModel


class AudioModelBase(ABC):
    def __init__(self, model_name, device, context_length=2048):
        self.model_name = model_name
        self.device = device
        self.context_length = context_length

    @abstractmethod
    def tokenize(self, text, audio_path=None, sample_rate=24000, voice=None):
        pass

    @abstractmethod
    def generate(self, inputs, **kwargs):
        pass

    @abstractmethod
    def decode(self, generated, **kwargs):
        pass


class CsmAudioModel(AudioModelBase):
    def __init__(self, model_name, device, processor_name, context_length=2048):
        super().__init__(model_name, device, context_length)
        self.processor = AutoProcessor.from_pretrained(processor_name)
        self.model, self.tokenizer = FastModel.from_pretrained(
            model_name=self.model_name,
            max_seq_length=self.context_length,
            dtype=None,
            auto_model=CsmForConditionalGeneration,
            load_in_4bit=False,
        )
        FastModel.for_inference(self.model)
        self.model = self.model.to(self.device)
        self.generate_kwargs = {
            "max_new_tokens": 1024,
            "output_audio": True,
        }

    def tokenize(self, text, audio_path=None, sample_rate=24000, voice=None):
        """
        Tokenize text and optionally audio for voice cloning.

        Args:
            text (str): Text to convert to speech
            audio_path (str, optional): Path to reference audio file for voice cloning
            sample_rate (int, optional): Sample rate for audio processing

        Returns:
            dict: Tokenized inputs ready for generation
        """
        speaker_id = 0

        if audio_path:
            # Load reference audio for voice cloning
            audio_array, _ = librosa.load(audio_path, sr=sample_rate)

            # Create conversation with reference audio and target text
            conversation = [
                {
                    "role": f"{speaker_id}",
                    "content": [
                        {"type": "text", "text": "This is how I sound."},
                        {"type": "audio", "path": audio_array},
                    ],
                },
                {
                    "role": f"{speaker_id}",
                    "content": [{"type": "text", "text": text}],
                },
            ]

            # Use processor's chat template for voice cloning
            inputs = self.processor.apply_chat_template(
                conversation,
                tokenize=True,
                return_dict=True,
            )
            return inputs.to(self.device)
        else:
            # Standard text-to-speech without voice cloning
            return self.processor(f"[{speaker_id}]{text}", add_special_tokens=True).to(self.device)

    def generate(self, inputs, **kwargs):
        gen_args = {**inputs, **self.generate_kwargs, **kwargs}
        return self.model.generate(**gen_args)

    def decode(self, generated, **kwargs):
        audio = generated[0].to(torch.float32).cpu().numpy()
        return audio


class OrpheusAudioModel(AudioModelBase):
    """
    Orpheus TTS model with voice cloning capabilities using SNAC audio codec.

    This model supports both standard text-to-speech and voice cloning by processing
    reference audio through the SNAC encoder and creating structured input sequences.
    """

    SNAC_MODEL_NAME = "hubertsiuzdak/snac_24khz"

    # Special tokens for voice cloning
    START_OF_HEADER = 128259  # SOH
    END_OF_TEXT = 128009  # EOT
    END_OF_HEADER = 128260  # EOH
    SPEECH_DELIMITER = 128261  # Speech delimiter
    START_OF_SPEECH = 128257  # <start_of_speech>
    END_OF_SPEECH = 128258  # <end_of_speech>
    SPEECH_SEPARATOR = 128262  # Speech separator
    PAD_TOKEN = 128263  # Padding token
    CODE_TOKEN_OFFSET = 128266  # Base offset for audio codes

    def __init__(self, model_name, device, context_length=2048):
        super().__init__(model_name, device, context_length)

        # Initialize SNAC audio codec model
        self.snac_model = SNAC.from_pretrained(self.SNAC_MODEL_NAME)
        self.snac_model = self.snac_model.to(self.device)

        # Initialize Orpheus language model
        self.model, self.tokenizer = FastModel.from_pretrained(
            model_name=self.model_name,
            max_seq_length=self.context_length,
            dtype=None,
            load_in_4bit=False,
        )
        FastModel.for_inference(self.model)
        self.model = self.model.to(self.device)

        # Configure generation parameters optimized for Orpheus TTS
        # Based on Orpheus documentation recommendations:
        # - repetition_penalty >= 1.1 required for stable generations
        # - Higher values make the model speak faster
        self.generate_kwargs = {
            "max_new_tokens": 10240,
            "eos_token_id": self.END_OF_SPEECH,
            "use_cache": True,
            "repetition_penalty": 1.1,
        }

    def tokenize(self, text, audio_path=None, sample_rate=None, voice=None):
        """
        Tokenize text and optionally audio for voice cloning.

        Args:
            text (str): Text to convert to speech
            audio_path (str, optional): Path to reference audio file for voice cloning
            sample_rate (int, optional): Sample rate for audio processing

        Returns:
            dict or torch.Tensor: Tokenized inputs ready for generation
        """
        # Tokenize target text
        prompt = f"{voice}: " + text if voice else text

        text_tokens = self.tokenizer(prompt, return_tensors="pt")
        text_input_ids = text_tokens["input_ids"].to(self.device)

        if audio_path:
            # Load and encode audio for voice cloning
            sample_rate = sample_rate
            audio_array, _ = librosa.load(audio_path, sr=sample_rate)
            audio_tokens = self._encode_audio_to_tokens(audio_array)
            return self._create_voice_cloning_input(text_input_ids, audio_tokens)
        else:
            # Standard text-to-speech without voice cloning
            return text_input_ids

    def generate(self, inputs, **kwargs):
        """
        Generate audio tokens from tokenized inputs.

        Args:
            inputs (torch.Tensor): Tokenized input_ids tensor
            **kwargs: Additional generation parameters

        Returns:
            torch.Tensor: Generated token sequences
        """
        return self.model.generate(inputs, **self.generate_kwargs, **kwargs)

    def decode(self, generated_ids, **kwargs):
        """
        Decode generated tokens back to audio waveform.

        Args:
            generated_ids (torch.Tensor): Generated token sequences
            **kwargs: Additional decoding parameters

        Returns:
            numpy.ndarray: Audio waveform
        """
        # Find and extract audio tokens
        start_indices = (generated_ids == self.START_OF_SPEECH).nonzero(as_tuple=True)
        if len(start_indices[1]) > 0:
            last_start_idx = start_indices[1][-1].item()
            cropped_tensor = generated_ids[:, last_start_idx + 1 :]
        else:
            cropped_tensor = generated_ids

        # Remove end of speech tokens and convert to codec codes
        processed_tokens = [row[row != self.END_OF_SPEECH] for row in cropped_tensor]

        # Process the first row (assuming single generation)
        row = processed_tokens[0]
        row_length = row.size(0)
        new_length = (row_length // 7) * 7
        trimmed_row = row[:new_length]

        # Convert to codec codes and decode to audio
        codec_codes = [token.item() - self.CODE_TOKEN_OFFSET for token in trimmed_row]
        return self._decode_to_audio(codec_codes).squeeze().to(torch.float32).cpu().detach().numpy()

    def _decode_to_audio(self, code_list):
        """
        Redistribute codec codes across SNAC layers for audio decoding.

        SNAC uses a hierarchical structure with 3 layers:
        - Layer 1: Base audio features (1 token per group)
        - Layer 2: Mid-level features (2 tokens per group)
        - Layer 3: Fine details (4 tokens per group)

        Args:
            code_list (list): Flattened list of codec codes

        Returns:
            torch.Tensor: Decoded audio waveform
        """
        layer_1, layer_2, layer_3 = [], [], []

        # Redistribute codes according to SNAC structure (7 codes per group)
        for i in range((len(code_list) + 1) // 7):
            base_idx = 7 * i

            # Layer 1: Base features
            layer_1.append(code_list[base_idx])

            # Layer 2: Mid-level features with offsets
            layer_2.append(code_list[base_idx + 1] - 4096)
            layer_2.append(code_list[base_idx + 4] - 4 * 4096)

            # Layer 3: Fine details with offsets
            layer_3.append(code_list[base_idx + 2] - 2 * 4096)
            layer_3.append(code_list[base_idx + 3] - 3 * 4096)
            layer_3.append(code_list[base_idx + 5] - 5 * 4096)
            layer_3.append(code_list[base_idx + 6] - 6 * 4096)

        # Convert to tensors and decode
        codes = [
            torch.tensor(layer_1, device=self.device).unsqueeze(0),
            torch.tensor(layer_2, device=self.device).unsqueeze(0),
            torch.tensor(layer_3, device=self.device).unsqueeze(0),
        ]

        return self.snac_model.decode(codes)

    def _encode_audio_to_tokens(self, waveform):
        """
        Encode audio waveform to tokens using SNAC encoder.

        Args:
            waveform (numpy.ndarray): Audio waveform

        Returns:
            list: Audio tokens with proper offsets
        """
        # Prepare waveform tensor and encode
        waveform_tensor = torch.from_numpy(waveform).unsqueeze(0).unsqueeze(0)
        waveform_tensor = waveform_tensor.to(dtype=torch.float32, device=self.device)

        with torch.inference_mode():
            codes = self.snac_model.encode(waveform_tensor)

        # Convert codes to tokens with layer-specific offsets
        all_tokens = []
        for i in range(codes[0].shape[1]):
            base_idx = 4 * i
            all_tokens.extend(
                [
                    codes[0][0][i].item() + self.CODE_TOKEN_OFFSET,  # Layer 1
                    codes[1][0][2 * i].item() + self.CODE_TOKEN_OFFSET + 4096,  # Layer 2
                    codes[2][0][base_idx].item() + self.CODE_TOKEN_OFFSET + 2 * 4096,  # Layer 3
                    codes[2][0][base_idx + 1].item() + self.CODE_TOKEN_OFFSET + 3 * 4096,  # Layer 3
                    codes[1][0][2 * i + 1].item() + self.CODE_TOKEN_OFFSET + 4 * 4096,  # Layer 2
                    codes[2][0][base_idx + 2].item() + self.CODE_TOKEN_OFFSET + 5 * 4096,  # Layer 3
                    codes[2][0][base_idx + 3].item() + self.CODE_TOKEN_OFFSET + 6 * 4096,  # Layer 3
                ]
            )

        return all_tokens

    def _create_voice_cloning_input(
        self, target_text_ids, audio_tokens, voice_prompt="This is the way I want you to sound. "
    ):
        """
        Create structured input for voice cloning.

        Creates the specific token sequence format required by Orpheus:
        SOH + voice_prompt + EOT EOH DELIM SOS + audio_tokens + EOS SEP + SOH + target_text + EOT EOH DELIM

        Args:
            target_text_ids (torch.Tensor): Pre-tokenized target text input_ids
            audio_tokens (list): Encoded reference audio tokens
            voice_prompt (str): Prompt describing the audio transcript

        Returns:
            torch.Tensor: Input tensor ready for generation
        """
        # Tokenize voice prompt
        voice_prompt_tokens = self.tokenizer(voice_prompt, return_tensors="pt")["input_ids"].to(
            self.device
        )

        # Create token sequences
        header_start = torch.tensor([[self.START_OF_HEADER]], dtype=torch.int64).to(self.device)
        header_end = torch.tensor(
            [[self.END_OF_TEXT, self.END_OF_HEADER, self.SPEECH_DELIMITER, self.START_OF_SPEECH]],
            dtype=torch.int64,
        ).to(self.device)

        voice_end = torch.tensor(
            [[self.END_OF_SPEECH, self.SPEECH_SEPARATOR]], dtype=torch.int64
        ).to(self.device)

        target_end = torch.tensor(
            [[self.END_OF_TEXT, self.END_OF_HEADER, self.SPEECH_DELIMITER]], dtype=torch.int64
        ).to(self.device)

        # Assemble complete input sequence
        input_sequence = [
            header_start,  # SOH
            voice_prompt_tokens,  # voice prompt
            header_end,  # EOT EOH DELIM SOS
            torch.tensor([audio_tokens], dtype=torch.int64).to(self.device),  # audio tokens
            voice_end,  # EOS SEP
            header_start,  # SOH
            target_text_ids,  # target text input_ids
            target_end,  # EOT EOH DELIM
        ]

        input_ids = torch.cat(input_sequence, dim=1)

        return input_ids.to(self.device)
