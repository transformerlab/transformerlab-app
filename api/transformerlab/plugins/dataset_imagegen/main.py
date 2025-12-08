import os
import shutil

import pandas as pd
import requests
from tqdm import tqdm
from transformerlab.sdk.v1.generate import tlab_gen


@tlab_gen.job_wrapper(progress_start=0, progress_end=100)
def run_generation():
    # Parameters
    width = int(tlab_gen.params.image_width)
    height = int(tlab_gen.params.image_height)
    images_per_prompt = int(tlab_gen.params.images_per_prompt)
    seed = int(tlab_gen.params.seed)
    steps = int(tlab_gen.params.num_inference_steps)
    scale = float(tlab_gen.params.guidance_scale)
    model_name = tlab_gen.params.model_name
    prompt_postfix = tlab_gen.params.prompt_postfix or ""
    prompt_column = tlab_gen.params.prompt_column
    negative_column = tlab_gen.params.negative_prompt_column.strip()

    dataset_id = tlab_gen.params.get("output_dataset_name")
    from transformerlab.plugin import WORKSPACE_DIR

    output_dir = os.path.join(WORKSPACE_DIR, "datasets", dataset_id)
    os.makedirs(output_dir, exist_ok=True)

    # Load dataset
    print(f"Loading dataset '{tlab_gen.params.dataset_name}'...")
    datasets = tlab_gen.load_dataset(dataset_types=["train"])
    dataset_df = datasets["train"].to_pandas()

    final_outputs = []
    total = len(dataset_df) * images_per_prompt
    counter = 0

    for i, (_, row) in enumerate(
        tqdm(dataset_df.iterrows(), total=len(dataset_df), desc="Generating images")
    ):
        prompt = str(row[prompt_column]).strip() + " " + prompt_postfix
        negative_prompt = (
            str(row[negative_column]).strip()
            if negative_column and negative_column in row
            else None
        )

        payload = {
            "prompt": prompt,
            "num_inference_steps": steps,
            "guidance_scale": scale,
            "model": model_name,
            "num_images": images_per_prompt,
            "seed": seed,
            "height": height,
            "width": width,
            "save_intermediate_images": False,
        }
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt

        try:
            response = requests.post("http://localhost:8338/diffusion/generate", json=payload)
            response.raise_for_status()
            result = response.json()
        except Exception as e:
            print(f"Image generation failed for row {i}: {e}")
            continue

        image_folder = result.get("image_folder", "")
        if not image_folder or not os.path.exists(image_folder):
            print(f"Image folder not found: {image_folder}")
            continue

        image_files = sorted(
            f for f in os.listdir(image_folder) if f.lower().endswith((".jpg", ".jpeg", ".png"))
        )

        for j, image_file in enumerate(image_files):
            src_path = os.path.join(image_folder, image_file)
            dst_name = f"prompt_{i}_image_{j}.jpg"
            dst_path = os.path.join(output_dir, dst_name)
            shutil.copy2(src_path, dst_path)
            print(f"Copied image: {src_path} → {dst_path}")

            entry = {"file_name": dst_name, "prompt": prompt}
            if negative_prompt:
                entry["negative_prompt"] = negative_prompt
            final_outputs.append(entry)

        counter += images_per_prompt
        tlab_gen.progress_update(10 + int(80 * counter / total))

    # Save full metadata
    df = pd.DataFrame(final_outputs)
    output_path, dataset_name = tlab_gen.save_generated_dataset(
        df, is_image=True, dataset_id=dataset_id
    )
    print(f"Dataset saved to {output_path} as '{dataset_name}'")

    return True


print("Starting image dataset generation...")
run_generation()
