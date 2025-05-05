export function API_URL() {
  return window.TransformerLab?.API_URL || null;
}

export function INFERENCE_SERVER_URL() {
  return window.TransformerLab?.inferenceServerURL || API_URL();
}

export function FULL_PATH(path: string) {
  if (API_URL() === null) {
    return null;
  }
  return API_URL() + path;
}
