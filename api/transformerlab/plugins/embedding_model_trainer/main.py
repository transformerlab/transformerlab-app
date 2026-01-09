import os
import random
import torch
import asyncio

from datasets import Dataset
from sentence_transformers import (
    SentenceTransformer,
    SentenceTransformerTrainer,
    SentenceTransformerTrainingArguments,
)
from sentence_transformers.evaluation import InformationRetrievalEvaluator, SequentialEvaluator
from sentence_transformers.util import cos_sim

# Import the trainer SDK
from transformerlab.sdk.v1.train import tlab_trainer
from transformerlab.plugin import generate_model_json
from lab.dirs import get_workspace_dir
from lab import storage


# --- Utility Functions ---
def normalize_dataset_columns(dataset, dataset_type_str):
    """
    Rename the dataset columns to the lower-case names derived from the dataset_type.
    It excludes any column named 'id' (which is preserved).
    Assumes that the relevant text columns (in order) are the first columns
    that are not 'id'.
    """
    expected_names = [name.strip().lower() for name in dataset_type_str.split("|")]
    # Get all columns except 'id'
    cols = [col for col in dataset.column_names if col.lower() != "id"]
    if len(expected_names) > len(cols):
        raise ValueError(f"Dataset does not have enough columns to match the dataset type '{dataset_type_str}'")
    mapping = {}
    for i, new_name in enumerate(expected_names):
        mapping[cols[i]] = new_name
    return dataset.rename_columns(mapping)


def get_loss_function(loss_name, model):
    """Dynamically import and instantiate the loss function from sentence_transformers.losses."""
    loss_module = __import__("sentence_transformers.losses", fromlist=[loss_name])
    try:
        loss_cls = getattr(loss_module, loss_name)
        return loss_cls(model)
    except AttributeError:
        raise ValueError(f"Loss function '{loss_name}' is not available in sentence_transformers.losses.")


def add_noise(sentence):
    """Randomly removes some words to create a noised version."""
    words = sentence.split()
    if len(words) < 2:
        return sentence  # Skip short sentences
    num_words_to_remove = max(1, len(words) // 4)  # Remove 25% of words
    indices_to_remove = random.sample(range(len(words)), num_words_to_remove)
    noised_words = [w for i, w in enumerate(words) if i not in indices_to_remove]
    return " ".join(noised_words)


def load_dataset_column(dataset, column_name="context"):
    """Load a specific column from a dataset and return the sentences as a list."""
    if column_name not in dataset.column_names:
        raise ValueError(f"Column '{column_name}' not found in dataset. Available columns: {dataset.column_names}")

    sentences = dataset[column_name]
    print(f"Loaded {len(sentences)} sentences from column '{column_name}'.")
    return sentences


def prepare_training_data(sentences):
    """Create dataset pairs with original and noised sentences."""
    data_pairs = [
        {"noised_text": add_noise(s), "original_text": s} for s in sentences if isinstance(s, str) and len(s) > 0
    ]
    return Dataset.from_list(data_pairs)


# Mapping from dataset type to allowed loss functions
ALLOWED_LOSSES = {
    "anchor | positive": [
        "MultipleNegativesRankingLoss",
        "CachedMultipleNegativesRankingLoss",
        "MultipleNegativesSymmetricRankingLoss",
        "CachedMultipleNegativesSymmetricRankingLoss",
        "MegaBatchMarginLoss",
        "GISTEmbedLoss",
        "CachedGISTEmbedLoss",
    ],
    "anchor | positive | negative": [
        "MultipleNegativesRankingLoss",
        "CachedMultipleNegativesRankingLoss",
        "TripletLoss",
        "CachedGISTEmbedLoss",
        "GISTEmbedLoss",
    ],
    "sentence_A | sentence_B | score": ["CoSENTLoss", "AnglELoss", "CosineSimilarityLoss"],
    "single sentences": ["ContrastiveTensionLoss", "DenoisingAutoEncoderLoss"],
    "single sentences | class": [
        "BatchAllTripletLoss",
        "BatchHardSoftMarginTripletLoss",
        "BatchHardTripletLoss",
        "BatchSemiHardTripletLoss",
    ],
    "anchor | anchor": ["ContrastiveTensionLossInBatchNegatives"],
    "damaged_sentence | original_sentence": ["DenoisingAutoEncoderLoss"],
    "sentence_A | sentence_B | class": ["SoftmaxLoss"],
    "anchor | positve/negative | class": ["ContrastiveLoss", "OnlineContrastiveLoss"],
    "anchor | positive | negative_1 | negative_2 | ... | negative_n": [
        "MultipleNegativesRankingLoss",
        "CachedMultipleNegativesRankingLoss",
        "CachedGISTEmbedLoss",
    ],
    "id | anchor | positive": [
        "MultipleNegativesRankingLoss",
        "CachedMultipleNegativesRankingLoss",
        "MultipleNegativesSymmetricRankingLoss",
        "CachedMultipleNegativesSymmetricRankingLoss",
        "MegaBatchMarginLoss",
        "GISTEmbedLoss",
        "CachedGISTEmbedLoss",
    ],
}


@tlab_trainer.job_wrapper()
def train_embedding_model():
    """Main function to train an embedding model using the TLab SDK"""

    # Type casting arguments
    tlab_trainer.params.max_samples = int(tlab_trainer.params.max_samples)

    # Get configuration parameters
    model_id = tlab_trainer.params.embedding_model
    model_file_path = tlab_trainer.params.embedding_model_file_path

    if model_file_path and model_file_path != "":
        model_id = model_file_path
        print(f"Using model file path: {model_file_path} as the primary model.")

    # Set final model name from model_id, template_name, and job_id
    template_name = tlab_trainer.params.template_name
    job_id = tlab_trainer.params.job_id
    final_model_name = f"{template_name}_{job_id}"

    # Define output directory
    workspace_dir = asyncio.run(get_workspace_dir())
    output_dir = storage.join(workspace_dir, "models", final_model_name)
    storage.makedirs(output_dir, exist_ok=True)

    # Extract training parameters from config
    # config = tlab_trainer.params._config
    num_train_epochs = int(tlab_trainer.params.get("num_train_epochs", 3))
    batch_size = int(tlab_trainer.params.get("batch_size", 16))
    learning_rate = float(tlab_trainer.params.get("learning_rate", 2e-5))
    warmup_ratio = float(tlab_trainer.params.get("warmup_ratio", 0.1))
    fp16 = bool(tlab_trainer.params.get("fp16", False))
    bf16 = bool(tlab_trainer.params.get("bf16", False))
    max_samples = tlab_trainer.params.max_samples

    # Get dataset configuration
    user_dataset_type = tlab_trainer.params.dataset_type
    user_loss_function = tlab_trainer.params.loss_function
    matryoshka_dims = [768, 512, 256, 128, 64]

    # Validate loss function against dataset type
    if user_dataset_type not in ALLOWED_LOSSES:
        raise ValueError(f"Dataset type '{user_dataset_type}' is not recognized.")

    allowed = ALLOWED_LOSSES[user_dataset_type]
    if user_loss_function not in allowed:
        raise ValueError(
            f"Loss function '{user_loss_function}' is not allowed for dataset type '{user_dataset_type}'. "
            f"Allowed loss functions: {allowed}"
        )

    # Get user-selected loss modifier
    loss_modifier_name = tlab_trainer.params.loss_modifier_name

    # Load the dataset using the TLabPlugin helper
    full_dataset = tlab_trainer.load_dataset(["train"])["train"]

    if max_samples > 0 and max_samples < len(full_dataset):
        full_dataset = full_dataset.select(range(max_samples))

    # Normalize dataset columns according to the dataset type
    if user_dataset_type != "single sentences":
        normalized_dataset = normalize_dataset_columns(full_dataset, user_dataset_type)
    else:
        sentences = load_dataset_column(full_dataset, tlab_trainer.params.text_column_name)
        normalized_dataset = prepare_training_data(sentences)

    # Prepare an IR evaluator if the normalized dataset has "id", "anchor", and "positive"
    evaluator = None
    has_evaluator = False
    if all(col in normalized_dataset.column_names for col in ["id", "anchor", "positive"]):
        corpus = dict(zip(normalized_dataset["id"], normalized_dataset["positive"]))
        queries = dict(zip(normalized_dataset["id"], normalized_dataset["anchor"]))
        relevant_docs = {q_id: [q_id] for q_id in queries}
        matryoshka_evaluators = []

        for dim in matryoshka_dims:
            ir_eval = InformationRetrievalEvaluator(
                queries=queries,
                corpus=corpus,
                relevant_docs=relevant_docs,
                name=f"dim_{dim}",
                truncate_dim=dim,
                score_functions={"cosine": cos_sim},
            )
            matryoshka_evaluators.append(ir_eval)

        if matryoshka_evaluators:
            evaluator = SequentialEvaluator(matryoshka_evaluators)
            has_evaluator = True

    # Load the model
    print(f"Loading Sentence Transformer model {model_id}")
    model = SentenceTransformer(
        model_id, device=("cuda" if torch.cuda.is_available() else "cpu"), local_files_only=os.path.exists(model_id)
    )

    # Configure loss function
    inner_train_loss = get_loss_function(user_loss_function, model)

    # Apply loss modifier if specified
    if loss_modifier_name != "None":
        if user_dataset_type == "single sentences":
            print("Warning: Loss modifier is not supported for single sentences dataset type.")
            print("Using the default loss function instead.")
            train_loss = inner_train_loss
        else:
            loss_modifier_module = __import__("sentence_transformers.losses", fromlist=[loss_modifier_name])
            loss_modifier_cls = getattr(loss_modifier_module, loss_modifier_name)

            if loss_modifier_name == "AdaptiveLayerLoss":
                # AdaptiveLayerLoss does not take matryoshka_dims as a parameter
                train_loss = loss_modifier_cls(model=model, loss=inner_train_loss)
            else:
                train_loss = loss_modifier_cls(model=model, loss=inner_train_loss, matryoshka_dims=matryoshka_dims)
    else:
        train_loss = inner_train_loss

    # Configure training arguments
    training_args = SentenceTransformerTrainingArguments(
        output_dir=output_dir,
        logging_dir=storage.join(output_dir, f"job_{job_id}_embedding_model_plugin"),
        num_train_epochs=num_train_epochs,
        per_device_train_batch_size=batch_size,
        fp16=fp16,
        bf16=bf16,
        warmup_ratio=warmup_ratio,
        learning_rate=learning_rate,
        load_best_model_at_end=False,
        eval_strategy="epoch" if has_evaluator else "no",
        save_strategy="epoch",
        logging_steps=10,
        save_total_limit=2,
        report_to=tlab_trainer.report_to,
        run_name=f"job_{job_id}_embedding_model_plugin",
        metric_for_best_model="eval_dim_128_cosine_ndcg@10",
        greater_is_better=True,
    )

    # Create a progress callback with TLabPlugin
    progress_callback = tlab_trainer.create_progress_callback(framework="huggingface")

    # Select appropriate columns for training
    if all(col in normalized_dataset.column_names for col in ["anchor", "positive"]):
        train_data = normalized_dataset.select_columns(["anchor", "positive"])
    else:
        train_data = normalized_dataset

    # Create and run the trainer
    trainer = SentenceTransformerTrainer(
        model=model,
        args=training_args,
        train_dataset=train_data,
        loss=train_loss,
        evaluator=evaluator,
        callbacks=[progress_callback],
    )

    trainer.train()
    print("Training completed.")

    # Save the model
    trainer.save_model(output_dir)
    print(f"Model saved to {output_dir}")

    # Import the model into TransformerLab
    try:
        json_data = {
            "description": f"An embedding model trained and generated by Transformer Lab based on {tlab_trainer.params.embedding_model}"
        }
        generate_model_json(
            final_model_name,
            tlab_trainer.params.get("embedding_model_architecture", "BertModel"),
            json_data=json_data,
        )
    except Exception as e:
        print(f"Warning: Failed to import model to Transformer Lab: {e}")

    return True


# Run the training function
train_embedding_model()
