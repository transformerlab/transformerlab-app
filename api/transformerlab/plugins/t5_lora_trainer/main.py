# The following was adapted from
# https://www.philschmid.de/fine-tune-flan-t5-peft
# and works with T5 models using
# transformers.Seq2SeqTrainer
# It is designed to only work with datasets that look
# like the samsum dataset.

import os
from dataclasses import dataclass, field

import numpy as np
import torch

if torch.cuda.is_available():
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"
    os.environ["HIP_VISIBLE_DEVICES"] = "0"

from datasets import DatasetDict, concatenate_datasets
from lab import storage
from peft import (
    LoraConfig,
    TaskType,
    get_peft_model,
    prepare_model_for_kbit_training,
)
from transformerlab.plugin import TEMP_DIR
from transformerlab.sdk.v1.train import tlab_trainer
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
)


@dataclass
class LoraArguments:
    lora_r: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.05
    lora_target_modules: list[str] = field(default_factory=lambda: ["q", "v"])
    lora_weight_path: str = ""
    lora_bias: str = "none"
    q_lora: bool = False
    peft_name: str = ""


@dataclass
class ModelArguments:
    model_name_or_path: str | None = field(default="google/flan_t5_small")


@dataclass
class DataArguments:
    data_path: str = field(default=None, metadata={"help": "Path to the training data."})
    lazy_preprocess: bool = False
    num_data: int = -1
    preprocessed_path: str = field(
        default=None, metadata={"help": "Path to the preprocessed training data."}
    )


class T5LoraTrainer:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.trainer = None
        self.dataset = None
        self.train_dataset = None
        self.test_dataset = None
        self.tokenized_dataset = None
        self.max_source_length = None
        self.max_target_length = None

    def load_dataset(self):
        """Load dataset using tlab_trainer helper"""
        datasets = tlab_trainer.load_dataset(dataset_types=["train", "test"])
        self.train_dataset = datasets["train"]
        self.test_dataset = datasets["test"]
        self.dataset = DatasetDict({"train": self.train_dataset, "test": self.test_dataset})

        print(f"Train dataset size: {len(self.train_dataset)}")
        print(f"Test dataset size: {len(self.test_dataset)}")
        return

    def tokenize_dataset(self):
        """Tokenize dataset using the model's tokenizer"""
        # Load tokenizer of current model
        self.tokenizer = AutoTokenizer.from_pretrained(tlab_trainer.params.model_name)

        # Determine max lengths for source and target
        tokenized_inputs = concatenate_datasets([self.train_dataset, self.test_dataset]).map(
            lambda x: self.tokenizer(x["dialogue"], truncation=True),
            batched=True,
            remove_columns=["dialogue", "summary"],
        )
        input_lenghts = [len(x) for x in tokenized_inputs["input_ids"]]
        self.max_source_length = int(np.percentile(input_lenghts, 85))
        print(f"Max source length: {self.max_source_length}")

        tokenized_targets = concatenate_datasets([self.train_dataset, self.test_dataset]).map(
            lambda x: self.tokenizer(x["summary"], truncation=True),
            batched=True,
            remove_columns=["dialogue", "summary"],
        )
        target_lenghts = [len(x) for x in tokenized_targets["input_ids"]]
        self.max_target_length = int(np.percentile(target_lenghts, 90))
        print(f"Max target length: {self.max_target_length}")
        return

    def __preprocess_function(self, sample, padding="max_length"):
        # add prefix to the input for t5
        inputs = ["summarize: " + item for item in sample["dialogue"]]
        # tokenize inputs
        model_inputs = self.tokenizer(
            inputs, max_length=self.max_source_length, padding=padding, truncation=True
        )

        # Tokenize targets with the `text_target` keyword argument
        labels = self.tokenizer(
            text_target=sample["summary"],
            max_length=self.max_target_length,
            padding=padding,
            truncation=True,
        )

        # Replace padding token id's with -100
        if padding == "max_length":
            labels["input_ids"] = [
                [(id if id != self.tokenizer.pad_token_id else -100) for id in input_ids]
                for input_ids in labels["input_ids"]
            ]

        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    def preprocess(self):
        """Preprocess the dataset for training"""
        self.tokenizer.pad_token = self.tokenizer.eos_token

        self.tokenized_dataset = self.dataset.map(
            self.__preprocess_function,
            batched=True,
            remove_columns=["dialogue", "summary", "id"],
        )
        print(f"Keys of tokenized dataset: {list(self.tokenized_dataset['train'].features)}")

        # save datasets to disk for later easy loading
        self.tokenized_dataset["train"].save_to_disk(storage.join(TEMP_DIR, "data", "train"))
        self.tokenized_dataset["test"].save_to_disk(storage.join(TEMP_DIR, "data", "eval"))

    def load_model(self):
        """Load base model for training"""
        self.model = AutoModelForSeq2SeqLM.from_pretrained(
            tlab_trainer.params.model_name, device_map="auto"
        )

    def train(self):
        """Main training function using tlab_trainer wrapper for progress tracking"""
        config = tlab_trainer.params._config

        # Load and process dataset
        self.load_dataset()
        self.tokenize_dataset()
        self.preprocess()

        # Load model
        self.load_model()

        # Get LoRA config parameters
        lora_r = int(config.get("lora_r", 8))
        lora_alpha = int(config.get("lora_alpha", 16))
        lora_dropout = float(config.get("lora_dropout", 0.05))

        # Setup LoRA configuration
        lora_config = LoraConfig(
            r=lora_r,
            lora_alpha=lora_alpha,
            target_modules=["q", "v"],
            lora_dropout=lora_dropout,
            bias="none",
            task_type=TaskType.SEQ_2_SEQ_LM,
        )

        # Prepare model for int8 training with LoRA
        self.model = prepare_model_for_kbit_training(self.model)
        self.model = get_peft_model(self.model, lora_config)
        self.model.print_trainable_parameters()

        # Setup data collator
        label_pad_token_id = -100
        data_collator = DataCollatorForSeq2Seq(
            self.tokenizer,
            model=self.model,
            label_pad_token_id=label_pad_token_id,
            pad_to_multiple_of=8,
        )

        # Create output directory if it doesn't exist
        output_dir = config.get("output_dir")
        storage.makedirs(output_dir, exist_ok=True)

        # Define training arguments
        training_args = Seq2SeqTrainingArguments(
            output_dir=output_dir,
            auto_find_batch_size=True,
            learning_rate=float(config.get("learning_rate", 3e-4)),
            num_train_epochs=int(config.get("num_train_epochs", 3)),
            logging_dir=storage.join(output_dir, f"job_{tlab_trainer.params.job_id}"),
            logging_strategy="steps",
            logging_steps=100,
            save_strategy="no",
            report_to=tlab_trainer.report_to,
        )

        # Create Trainer instance with progress callback
        self.trainer = Seq2SeqTrainer(
            model=self.model,
            args=training_args,
            data_collator=data_collator,
            train_dataset=self.tokenized_dataset["train"],
            callbacks=[tlab_trainer.create_progress_callback(framework="huggingface")],
        )

        # Disable cache for training
        self.model.config.use_cache = False

        # Run training
        self.trainer.train()

        # Save model
        adaptor_output_dir = config.get("adaptor_output_dir")
        self.trainer.model.save_pretrained(adaptor_output_dir)
        self.tokenizer.save_pretrained(adaptor_output_dir)

        # Create TransformerLab model entry
        fused_model_name = config.get("adaptor_name", "t5-lora-finetuned")
        model_architecture = "T5ForConditionalGeneration"
        json_data = {
            "base_model": config.get("model_name"),
            "lora_r": lora_r,
            "lora_alpha": lora_alpha,
            "lora_dropout": lora_dropout,
            "dataset": config.get("dataset_name"),
        }

        tlab_trainer.create_transformerlab_model(
            fused_model_name=fused_model_name,
            model_architecture=model_architecture,
            json_data=json_data,
            output_dir=adaptor_output_dir,
        )

        return "Training completed successfully"


# Start the training
@tlab_trainer.job_wrapper()
def run_training():
    trainer = T5LoraTrainer()
    trainer.train()


run_training()
