# Embedding Model Trainer

## Overview

The **Embedding Model Trainer** plugin is designed to train or fine-tune embedding models using `Sentence Transformers v3`. It supports a wide variety of dataset formats and loss functions, and it can optionally leverage advanced loss modifiers such as **MatryoshkaLoss**, **AdaptiveLayerLoss**, or **Matryoshka2dLoss**. With this approach, your model learns to generate embeddings that can be truncated to various sizes with minimal performance loss—ideal for scenarios like large-scale retrieval or on-device inference.

## Key Features

1. **Flexible Dataset Handling**
   - Supports both local (custom user data) and Hugging Face-hosted datasets.
   - Accepts multiple dataset formats (e.g., pairs, triplets, score-based, single sentence with class labels).
   - Automatically normalizes dataset column names based on the user-specified dataset type (e.g., `anchor | positive`, `sentence_A | sentence_B | score`).

2. **Configurable Loss Functions**
   - Offers a broad list of loss functions from which you can choose.
   - Uses an internal mapping to validate that the selected loss function is appropriate for your dataset type.
   - Dynamically imports the chosen loss function from the `sentence_transformers.losses` module.

3. **Loss Modifiers for Enhanced Training**
   - Supports loss modifiers such as **MatryoshkaLoss**, **AdaptiveLayerLoss**, and **Matryoshka2dLoss**.
   - If a loss modifier is selected, the inner loss function is wrapped accordingly.
   - Note: For example, if **AdaptiveLayerLoss** is chosen, it is instantiated without the `matryoshka_dims` parameter because it does not support it.

4. **Integrated Evaluation**
   - If your dataset includes `(id, anchor, positive)` columns, the plugin automatically creates a sequence of `InformationRetrievalEvaluator` instances.
   - This allows multi-dimension evaluation (e.g., truncated embeddings at dimensions like 768, 512, 256, 128, 64) with IR metrics such as NDCG@10.

5. **Ease of Integration**
   - Designed for use with an Electron/React + FastAPI environment.
   - Monitors training progress and logs status updates into the LLM Lab database.
   - Optionally integrates with Weights & Biases (W&B) for advanced experiment tracking.

## Parameters

| **Name**             | **Type**             | **Default**                   | **Description**                                                                                                                                             |
|----------------------|----------------------|-------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **dataset_type**     | string               | `"Anchor \| Positive"`         | Select the type of dataset you are using. Options include formats such as `"Anchor \| Positive"`, `"Anchor \| Positive \| Negative"`, `"Sentence A \| Sentence B \| Score"`, etc. |
| **loss_function**    | string               | `"MultipleNegativesRankingLoss"` | Select the loss function to use. Refer https://sbert.net/docs/sentence_transformer/loss_overview.html for details.                             |
| **loss_modifier**    | string               | `"MatryoshkaLoss"`            | (Optional) Select a loss modifier to wrap the inner loss. Options include `"MatryoshkaLoss"`, `"AdaptiveLayerLoss"`, or `"Matryoshka2dLoss"`.                 |
| **num_train_epochs** | integer              | 3                             | Number of epochs for fine-tuning the embedding model.                                                                                                       |
| **batch_size**       | integer              | 16                            | Batch size per device (GPU/CPU). Larger values may speed up training but require more memory.                                                                   |
| **learning_rate**    | number               | 0.00002                       | Learning rate for the optimizer. Typical values range from 1e-5 to 1e-4.                                                                                       |
| **warmup_ratio**     | number               | 0.1                           | Fraction of total training steps used for linear warmup.                                                                                                     |
| **fp16**             | boolean              | true                          | Enable half-precision (FP16) training for faster throughput if supported by your GPU.                                                                          |
| **bf16**             | boolean              | false                         | Use bfloat16 precision if your GPU supports it (often used on TPUs or newer NVIDIA GPUs).                                                                       |
| **max_samples**      | integer              | -1                            | Limit the number of training samples (use -1 to train on all available data).                                                                                 |
| **log_to_wandb**     | boolean              | false                         | Log training metrics to Weights & Biases if a W&B API key is configured.                                                                                       |
| **matryoshka_dims**  | array of integers   | `[768, 512, 256, 128, 64]`      | (Optional) Dimensions used for Matryoshka Representation Learning. Must be in descending order. *(Not used with AdaptiveLayerLoss)*.                         |
| **adaptor_name**     | string               | `"dummy"`                     | Name of the adaptor.                                                                                                                                           |

## Usage

1. **Setup and Installation**
   - Install the plugin from the plugin store 
   - Load the relevant embedding model that you want to fine tune in Foundation before proceeding further
   - The default model used is `BAAI/bge-base-en-v1.5`

2. **Preparing Your Dataset**
   - Ensure your dataset is formatted according to one of the supported types. For example, if using pair-based data, your dataset should include columns like `(anchor, positive)`.
   - Download/Upload/Create your dataset into Transformer Lab before using this plugin 

3. **Configuring Parameters**
   - In the application’s plugin UI, select the appropriate **dataset_type** and **loss_function** from the provided dropdowns.
        
        - Allowed Loss Functions for Dataset Types:
            - **`anchor | positive`**: `MultipleNegativesRankingLoss`, `CachedMultipleNegativesRankingLoss`, `MultipleNegativesSymmetricRankingLoss`, `CachedMultipleNegativesSymmetricRankingLoss`, `MegaBatchMarginLoss`, `GISTEmbedLoss`, `CachedGISTEmbedLoss`
            - **`anchor | positive | negative`**: `MultipleNegativesRankingLoss`, `CachedMultipleNegativesRankingLoss`, `TripletLoss`, `CachedGISTEmbedLoss`, `GISTEmbedLoss`
            - **`sentence_A | sentence_B | score`**: `CoSENTLoss`, `AnglELoss`, `CosineSimilarityLoss`
            - **`single sentences`**: `ContrastiveTensionLoss`, `DenoisingAutoEncoderLoss`
            - **`single sentences | class`**: `BatchAllTripletLoss`, `BatchHardSoftMarginTripletLoss`, `BatchHardTripletLoss`, `BatchSemiHardTripletLoss`
            - **`anchor | anchor`**: `ContrastiveTensionLossInBatchNegatives`
            - **`damaged_sentence | original_sentence`**: `DenoisingAutoEncoderLoss`
            - **`sentence_A | sentence_B | class`**: `SoftmaxLoss`
            - **`anchor | positve/negative | class (0/1)`**: `ContrastiveLoss`, `OnlineContrastiveLoss`
            - **`anchor | positive | negative_1 | negative_2 | ... | negative_n`**: `MultipleNegativesRankingLoss`, `CachedMultipleNegativesRankingLoss`, `CachedGISTEmbedLoss`

   - Optionally, choose a **loss_modifier** if you want to wrap the inner loss function (note that if AdaptiveLayerLoss is chosen, the plugin will not pass `matryoshka_dims` to it).
        - **`MatryoshkaLoss`**: Produce embeddings whose size can be truncated without notable losses in performance.
        - **`AdaptiveLayerLoss`**: Model performs well even when you remove model layers for faster inference.
        - **`Matryoshka2dLoss`**: Combines the above two to provide possible configurations to improve efficientcy and lower storage costs

        *Note* : *The loss modifiers are attached with default configs. To modify them, kindly add the params directly in the loss modifier section of the plugin in main.py. The MatryoshkaLoss modifiers won't work with the 'single sentences' dataset types, please select 'AdaptiveLayerLoss' or 'None' for that dataset type.* 

   - Adjust training parameters (number of epochs, batch size, learning rate, etc.) to suit your hardware and application requirements.
   - Enable **log_to_wandb** if you wish to track training metrics with Weights & Biases.

4. **Running Training**
   - Start the training process by queuing the created training template. The plugin will:
     - Load your dataset (either from local storage or Hugging Face).
     - Normalize the dataset’s column names based on the selected dataset type.
     - Dynamically import and instantiate the selected loss function.
     - Optionally wrap the loss using the specified loss modifier.
     - Initialize a `SentenceTransformer` model.
     - If evaluation columns (e.g., `id`, `anchor`, and `positive`) exist, automatically set up multi-dimension IR evaluators.
     - Begin training, updating progress in the LLM Lab database and optionally logging to W&B.
     - Save the final model artifacts in the specified `output_dir`.

5. **Evaluating Multi-Dimension Embeddings**
   - During training, if evaluation is enabled, the plugin will create evaluators that truncate the model’s embeddings to each specified dimension (as given in `matryoshka_dims`) and compute metrics like NDCG@10.
   - These metrics help assess how well the model performs when its embeddings are reduced in size.

6. **Final Model Artifacts**
   - On successful completion, the plugin saves the trained model to the output directory.
   - The job status is updated in the LLM Lab database as `success`; if an error occurs, it is marked `failed` with an appropriate error message.

## Example Scenario

**Fine-tuning for Financial Document Embedding**  
- **Dataset Format:** `(id, anchor, positive)` pairs containing questions and related document context.
- **Selected Parameters:**
  - **dataset_type:** `"Anchor | Positive"`
  - **loss_function:** `"MultipleNegativesRankingLoss"`
  - **loss_modifier:** `"MatryoshkaLoss"` (or choose `"AdaptiveLayerLoss"` if preferred; note that AdaptiveLayerLoss does not use `matryoshka_dims`).
  - **Model:** `BAAI/bge-base-en-v1.5`
  - **matryoshka_dims:** `[768, 512, 256, 128, 64]`
  - **Training:** 3 epochs, batch size 16, learning rate 2e-5.
- **Outcome:** A single model capable of generating multi-dimension embeddings with automated IR evaluation across truncated sizes.

## Troubleshooting & Tips

- **Dataset Column Mismatch:**  
  Ensure that the dataset’s columns are compatible with the chosen dataset type. The plugin will rename columns based on the `dataset_type` string (splitting by `|` and converting to lowercase). If the dataset has extra or missing columns, adjust your data or modify the normalization logic.

- **Loss Function Compatibility:**  
  The plugin validates that the selected loss function is allowed for your dataset type. If you encounter an error, review the supported combinations in the parameters description.

- **Loss Modifier Selection:**  
  If you choose a loss modifier:
  - **MatryoshkaLoss / Matryoshka2dLoss:** `matryoshka_dims` is passed automatically.
  - **AdaptiveLayerLoss:** `matryoshka_dims` is not passed (as it is not supported). Ensure your selection reflects this behavior.

- **Evaluation Requirements:**  
  For automated evaluation, your dataset should include an `id` column along with `anchor` and `positive`. If missing, you can add an `id` column programmatically:

    ```python
    dataset = dataset.add_column("id", range(len(ds)))
    ``` 
    This is needed if you want automatic IR evaluation.

- **GPU Compatibility:**
    - Use `fp16` if you have an NVIDIA GPU with half-precision support (e.g., RTX 20 series or later).
    - `bf16` is typically used on newer GPUs or TPUs.

- **Large Datasets:** Increase batch size only if you have enough GPU memory.
- **Logs:** If `log_to_wandb` is `true`, ensure your W&B key is set in the platform settings.

Feel free to customize the plugin code for advanced features or additional losses. For support, reach out on Discord.

Happy Training!