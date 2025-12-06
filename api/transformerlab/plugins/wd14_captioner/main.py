import os
import shutil
import subprocess
import sys
from pathlib import Path

import pandas as pd
from huggingface_hub import snapshot_download
from lab import storage
from lab.dirs import get_workspace_dir
from tqdm import tqdm
from transformerlab.sdk.v1.generate import tlab_gen


@tlab_gen.job_wrapper()
def run_generation():
    # ----- Constants -----
    workspace = get_workspace_dir()

    REPO_ROOT = storage.join(
        workspace, "plugins", "wd14_captioner", "sd-caption-wd14", "sd-scripts"
    )
    SCRIPT_PATH = storage.join(
        workspace,
        "plugins",
        "wd14_captioner",
        "sd-caption-wd14",
        "sd-scripts",
        "finetune",
        "tag_images_by_wd14_tagger.py",
    )
    TMP_DATASET_DIR = Path(storage.join(workspace, "plugins", "wd14_captioner", "tmp_dataset"))

    repo_id = tlab_gen.params.generation_model
    caption_separator = tlab_gen.params.caption_separator
    max_workers = str(tlab_gen.params.get("max_data_loader_n_workers", 1))
    model_dir = Path(
        storage.join(
            workspace,
            "plugins",
            "wd14_captioner",
            "sd-caption-wd14",
            "sd-scripts",
            "wd14_tagger_model",
            repo_id.replace("/", "_"),
        )
    )

    if not model_dir.exists():
        snapshot_download(
            repo_id=repo_id, local_dir=model_dir, local_dir_use_symlinks=False, repo_type="model"
        )

    tlab_gen.progress_update(0)
    datasets = tlab_gen.load_dataset(dataset_types=["train"])
    df = datasets["train"].to_pandas()

    if tlab_gen.params.image_field not in df.columns:
        raise ValueError(
            f"❌ Field '{tlab_gen.params.image_field}' not found in dataset. Available fields: {list(df.columns)}"
        )

    if TMP_DATASET_DIR.exists():
        shutil.rmtree(TMP_DATASET_DIR)
    TMP_DATASET_DIR.mkdir(parents=True)

    local_paths = []
    image_paths = []

    image_column = tlab_gen.params.image_field
    image_series = df[image_column]

    for idx, img_entry in enumerate(tqdm(image_series)):
        real_path = img_entry["path"]
        ext = Path(real_path).suffix
        if ext == "":
            dst = TMP_DATASET_DIR / f"{idx:06d}.jpg"
        else:
            dst = TMP_DATASET_DIR / f"{idx:06d}.{ext}"
        shutil.copy(real_path, dst)
        image_paths.append(img_entry)

        local_paths.append(dst)
        tlab_gen.progress_update(5 + (idx + 1) / len(image_series) * 15)

    # Build subprocess command
    command = [
        sys.executable,
        str(SCRIPT_PATH),
        "--onnx",
        "--repo_id",
        repo_id,
        "--batch_size",
        "1",
        "--caption_separator",
        caption_separator,
        str(TMP_DATASET_DIR),
        "--max_data_loader_n_workers",
        max_workers,
        "--recursive",
    ]

    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT)

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        env=env,
        cwd=REPO_ROOT,
    )

    tlab_gen.progress_update(25)

    print("🔍 Subprocess STDOUT:")
    print(result.stdout)
    print("🔍 Subprocess STDERR:")
    print(result.stderr)

    if result.returncode != 0:
        raise RuntimeError(f"❌ WD14 tagger subprocess failed with exit code {result.returncode}")

    captions = []
    for i, path in enumerate(local_paths):
        caption_path = path.with_suffix(".txt")
        if not caption_path.exists():
            raise FileNotFoundError(
                f"❌ Missing caption file for {path.name}: expected at {caption_path}"
            )
        caption_text = caption_path.read_text().strip()
        captions.append(caption_text)
        tlab_gen.progress_update(25 + (i + 1) / len(local_paths) * 25)

    df_output = pd.DataFrame(
        {
            "file_name": [p.name for p in local_paths],
            "caption": captions,
        }
    )

    tlab_gen.progress_update(60)

    # Save the results as a dataset
    dataset_id = tlab_gen.params.get("output_dataset_name")
    print(f"Saving generated dataset with ID: {dataset_id}")
    output_path, dataset_name = tlab_gen.save_generated_dataset(
        df_output, is_image=True, dataset_id=dataset_id
    )

    output_dir = storage.join(workspace, "datasets", dataset_id)
    for src, dst in zip(local_paths, df_output["file_name"]):
        final_dst = storage.join(output_dir, dst)
        # Use storage.copy_file for fsspec-compatible copying
        storage.copy_file(str(src), final_dst)

    tlab_gen.progress_update(95)

    print(f"✅ Saved captioned dataset as '{dataset_name}' at: {output_path}")

    shutil.rmtree(TMP_DATASET_DIR)
    tlab_gen.progress_update(100)


print("Starting image dataset captioning...")
run_generation()
