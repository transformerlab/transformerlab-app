from datetime import datetime
from time import sleep
import pandas as pd

from lab import lab


def generate_dataset():
    """Fake dataset generation function that runs locally but reports to TransformerLab"""

    # Dataset generation configuration
    config = {
        "experiment_name": "alpha",
        "model_name": "HuggingFaceTB/SmolLM-135M-Instruct",
        "template_name": "dataset-generation-demo",
        "_config": {
            "dataset_type": "synthetic",
            "num_samples": 100,
            "generation_method": "fake_data",
        },
    }

    try:
        # Initialize lab with default/simple API
        lab.init()
        lab.set_config(config)

        # Log start time
        start_time = datetime.now()
        lab.log(f"Dataset generation started at {start_time}")

        # Generate a simple text classification dataset
        lab.log("Generating text classification dataset...")
        sleep(0.5)
        lab.update_progress(30)

        dataset_data = []
        categories = ["positive", "negative", "neutral"]
        sample_texts = [
            "This is a great product!",
            "I don't like this at all.",
            "It's okay, nothing special.",
            "Amazing quality and fast delivery!",
            "Poor customer service experience.",
            "It meets my expectations.",
        ]

        for i in range(50):
            dataset_data.append(
                {
                    "text": sample_texts[i % len(sample_texts)] + f" (sample {i + 1})",
                    "label": categories[i % len(categories)],
                    "label_id": i % len(categories),
                    "confidence": 0.7 + (i % 3) * 0.1,
                }
            )

        df = pd.DataFrame(dataset_data)
        lab.log(f"Generated {len(df)} samples")

        # Save dataset using save_artifact with type="dataset"
        lab.log("Saving dataset...")
        saved_path = lab.save_artifact(
            df,
            name="generated_text_classification_dataset",
            type="dataset",
            config={
                "dataset": {
                    "description": "Synthetic text classification dataset generated from job",
                    "task": "text_classification",
                    "num_classes": 3,
                    "source": "synthetic_generation",
                }
            },
        )
        lab.log(f"✅ Saved dataset: {saved_path}")
        lab.update_progress(80)

        # Calculate generation time
        end_time = datetime.now()
        generation_duration = end_time - start_time
        lab.log(f"Dataset generation completed in {generation_duration}")

        # Get generated dataset from job data
        job_data = lab.job.get_job_data()
        generated_datasets = job_data.get("generated_datasets", [])

        if generated_datasets:
            lab.log(f"Generated dataset: {generated_datasets[0]}")

        lab.update_progress(100)

        print("Dataset Generation Complete")

        # Complete the job in TransformerLab via facade
        lab.finish(
            "Dataset generation completed successfully",
            score={
                "total_samples": len(df),
                "dataset_id": generated_datasets[0] if generated_datasets else None,
            },
        )

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(generation_duration),
            "generated_dataset": generated_datasets[0] if generated_datasets else None,
            "total_samples": len(df),
        }

    except KeyboardInterrupt:
        lab.error("Stopped by user or remotely")
        return {"status": "stopped", "job_id": lab.job.id}

    except Exception as e:
        error_msg = str(e)
        print(f"Dataset generation failed: {error_msg}")

        import traceback

        traceback.print_exc()
        lab.error(error_msg)
        return {"status": "error", "job_id": lab.job.id, "error": error_msg}


if __name__ == "__main__":
    result = generate_dataset()
    print(result)
