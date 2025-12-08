import pandas as pd
from requests_batching import process_dataset
from transformerlab.sdk.v1.generate import tlab_gen


async def generate_batched(trlab_model, df: pd.DataFrame, sys_prompt_col=None) -> pd.DataFrame:
    updated_df = await process_dataset(
        df,
        batch_size=tlab_gen.params.batch_size,
        model=trlab_model.generation_model_name,
        inference_url=trlab_model.chat_completions_url,
        api_key=trlab_model.api_key,
        sys_prompt_col=sys_prompt_col,
        input_col=tlab_gen.params.input_column,
        output_col=tlab_gen.params.output_column,
        temperature=float(tlab_gen.params.temperature),
        max_tokens=int(tlab_gen.params.max_tokens),
        top_p=float(tlab_gen.params.top_p),
    )
    return updated_df


@tlab_gen.async_job_wrapper(progress_start=0, progress_end=100)
async def run_generation():
    """Main function for batched generation"""
    print(f"Generation type: {tlab_gen.params.generation_type}")
    print(f"Model Name: {tlab_gen.params.generation_model}")
    print(f"Dataset Name: {tlab_gen.params.dataset_name}")

    # Load the dataset ('train' split) using tlab_gen's built-in method
    dataset = tlab_gen.load_dataset([tlab_gen.params.dataset_split])
    df = dataset[tlab_gen.params.dataset_split].to_pandas()
    print(f"Dataset loaded successfully with {len(df)} rows")
    tlab_gen.progress_update(20)

    # Apply system prompt if provided
    sys_prompt_col = None
    if tlab_gen.params.system_prompt:
        print(f"Using system prompt: {tlab_gen.params.system_prompt}")
        df["system_prompt"] = tlab_gen.params.system_prompt
        sys_prompt_col = "system_prompt"

    # Load the model for generation
    trlab_model = tlab_gen.load_evaluation_model(field_name="generation_model")
    print("Model loaded successfully")
    tlab_gen.progress_update(30)

    # Run batched generation
    print("Running batched generation...")
    updated_df = await generate_batched(trlab_model, df, sys_prompt_col=sys_prompt_col)
    print("Batched generation completed successfully")
    tlab_gen.progress_update(80)

    # Save the results as a new dataset
    metadata = {
        "generation_method": "batched",
        "input_column": tlab_gen.params.input_column,
        "output_column": tlab_gen.params.output_column,
        "system_prompt": tlab_gen.params.get("system_prompt", None),
        "batch_size": tlab_gen.params.get("batch_size", 128),
        "temperature": tlab_gen.params.get("temperature", 0.01),
        "max_tokens": tlab_gen.params.get("max_tokens", 1024),
        "top_p": tlab_gen.params.get("top_p", 1.0),
        "source_dataset": tlab_gen.params.dataset_name,
        "dataset_split": tlab_gen.params.get("dataset_split", "train"),
    }

    custom_name = tlab_gen.params.get("output_dataset_name")
    output_file, dataset_name = tlab_gen.save_generated_dataset(
        updated_df, metadata, dataset_id=custom_name
    )
    tlab_gen.progress_update(100)

    print(f"Dataset processed successfully as {dataset_name}")
    print(f"Saved to {output_file}")

    return updated_df


run_generation()
