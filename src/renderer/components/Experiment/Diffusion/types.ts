export type HistoryImage = {
  id: string;
  prompt: string;
  image_base64: string;
  timestamp: string;
  num_images?: number; // Add support for multiple images
  metadata: {
    prompt: string;
    num_inference_steps: number;
    guidance_scale: number;
    seed: number;
    model: string;
    adaptor: string;
    adaptor_scale?: number;
    upscale?: boolean;
    upscale_factor?: number;
    negative_prompt?: string;
    eta?: number;
    clip_skip?: number;
    guidance_rescale?: number;
    width?: number;
    height?: number;
    generation_time?: number;
    num_images?: number; // Add num_images to metadata as well
    input_image_path?: string;
    strength?: number;
    is_img2img?: boolean;
    mask_image_path?: string;
    is_inpainting?: boolean;
  };
};

export type HistoryData = {
  images: HistoryImage[];
  total: number;
};
