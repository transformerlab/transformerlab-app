# Image Generation from Prompts

This plugin generates an image dataset using a text-to-image diffusion model (e.g., Stable Diffusion) based on user-provided prompts. 

The plugin will use the local diffusion model.

## Input

You must provide a dataset of prompts to work with this plugin. The dataset can be added in the `Datasets` tab.

If your dataset includes a negative prompt column, you must also specify its column name explicitly.

## Parameters

| Name | Description |
|------|-------------|
| `Prompt Dataset` | The dataset containing prompts.
| `Prompt Column Name` | The name of the column containing the main prompts. Required. |
| `Negative Prompt Column Name` | Optional. If provided, this column will be passed as the `negative_prompt`. Leave empty if not applicable. |
| `Prompt Postfix` | Optional string to append to every prompt (e.g., "in high resolution"). |
| `Image Width` | Width of generated images in pixels (min: 64, default: 512). |
| `Image Height` | Height of generated images in pixels (min: 64, default: 512). |
| `Images per Prompt` | Number of images to generate per prompt (default: 4, max: 8). |
| `Random Seed` | Seed for deterministic results (use -1 for randomness). |
| `Guidance Scale` | How strongly the model follows the prompt (default: 7.5, range: 1.0–20.0). |
| `Number of Inference Steps` | Controls generation quality and speed (default: 30, max: 100). |

## Output

The plugin generates:
- One or more images per prompt saved in the final dataset folder
- A full metadata JSON file automatically uploaded to your workspace
- A `metadata.jsonl` file with fields: `file_name`, `prompt`, and optionally `negative_prompt`

Example entry in `metadata.jsonl`:
```json
{
  "file_name": "prompt_2_image_0.jpg",
  "prompt": "a surreal castle floating in space",
  "negative_prompt": "low quality, blurry"
}
```

## Notes

- You can customize the resolution, seed, and the number of images.
