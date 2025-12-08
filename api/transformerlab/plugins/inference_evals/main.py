import json

import pandas as pd
from requests_batching import process_dataset
from transformerlab.sdk.v1.evals import tlab_evals

# Metrics mapping
metrics_map = {
    "Time to First Token (TTFT)": "time_to_first_token",
    "Total Time": "time_total",
    "Prompt Tokens": "prompt_tokens",
    "Completion Tokens": "completion_tokens",
    "Total Tokens": "total_tokens",
    "Tokens per Second": "tokens_per_second",
}


async def generate_batched(trlab_model, df: pd.DataFrame, sys_prompt_col=None) -> pd.DataFrame:
    updated_df = await process_dataset(
        df,
        batch_size=tlab_evals.params.batch_size,
        model=trlab_model.generation_model_name,
        inference_url=trlab_model.chat_completions_url,
        api_key=trlab_model.api_key,
        sys_prompt_col=sys_prompt_col,
        input_col=tlab_evals.params.input_column,
        output_col=tlab_evals.params.output_column,
        temperature=float(tlab_evals.params.temperature),
        max_tokens=int(tlab_evals.params.max_tokens),
        top_p=float(tlab_evals.params.top_p),
    )
    return updated_df


@tlab_evals.async_job_wrapper(progress_start=0, progress_end=100)
async def run_evaluation():
    """Run the inference evaluation"""

    # Type casting for avoiding errors
    tlab_evals.params.batch_size = int(tlab_evals.params.batch_size)
    tlab_evals.params.temperature = float(tlab_evals.params.temperature)
    tlab_evals.params.max_tokens = int(tlab_evals.params.max_tokens)
    tlab_evals.params.top_p = float(tlab_evals.params.top_p)

    # Parse the tasks
    if isinstance(tlab_evals.params.tasks, str):
        try:
            tasks_list = json.loads(tlab_evals.params.tasks)
            if isinstance(tasks_list, list):
                tlab_evals.params.tasks = tasks_list
            else:
                raise ValueError("Tasks should be a list of task names.")
        except json.JSONDecodeError:
            # assuming older tasks which were sent as a comma-separated string
            tlab_evals.params.tasks = tlab_evals.params.tasks.split(",")

    tasks = tlab_evals.params.tasks
    tlab_evals.progress_update(10)

    # Load the appropriate model
    try:
        trlab_model = tlab_evals.load_evaluation_model(field_name="generation_model")

        print("Model loaded successfully")
    except Exception as e:
        print(f"An error occurred while loading the model: {e}")
        raise

    tlab_evals.progress_update(20)

    # Load the dataset
    dataset = tlab_evals.load_dataset()
    df = dataset["train"].to_pandas()

    print("Dataset fetched successfully")

    sys_prompt_col = None
    if tlab_evals.params.system_prompt and tlab_evals.params.system_prompt:
        df["system_prompt"] = tlab_evals.params.system_prompt
        sys_prompt_col = "system_prompt"

    tlab_evals.progress_update(30)

    # Run batch generation
    df = await generate_batched(trlab_model, df, sys_prompt_col=sys_prompt_col)
    print("Batched generation completed successfully")

    tlab_evals.progress_update(70)

    # Process metrics
    metrics = []
    for metric in tasks:
        metric_value = df[metrics_map[metric]].mean()
        tlab_evals.log_metric(metric, metric_value)

    # Create metrics DataFrame
    for idx, row in df.iterrows():
        for metric in tasks:
            if row[metrics_map[metric]] is not None:
                score = round(float(row[metrics_map[metric]]), 4)
            else:
                score = 0.0
            metrics.append(
                {
                    "test_case_id": f"test_case_{idx}",
                    "metric_name": metric,
                    "score": score,
                    "input": row[tlab_evals.params.input_column],
                    "output": row[tlab_evals.params.output_column],
                }
            )

    tlab_evals.progress_update(80)

    # Save results using EvalsTFLPlugin
    metrics_df = pd.DataFrame(metrics)
    output_path, plot_data_path = tlab_evals.save_evaluation_results(metrics_df)

    print(f"Metrics saved to {output_path}")
    print(f"Plotting data saved to {plot_data_path}")
    print("Evaluation completed.")

    return True


run_evaluation()
