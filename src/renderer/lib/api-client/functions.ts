import { API_URL, INFERENCE_SERVER_URL, FULL_PATH } from './urls';

export async function downloadModelFromHuggingFace(
  modelName: string,
  job_id = null,
) {
  console.log(encodeURIComponent(modelName));

  let requestString = `${API_URL()}model/download_from_huggingface?model=${encodeURIComponent(
    modelName,
  )}`;
  if (job_id) {
    requestString += `&job_id=${job_id}`;
  }

  let result = {};
  try {
    const response = await fetch(requestString);
    result = await response.json();

    // Error during fetch
  } catch (error) {
    return {
      status: 'error',
      message: 'Fetch exception: ' + error,
    };
  }

  return result;
}

export async function downloadModelFromGallery(
  galleryID: string,
  job_id = null,
) {
  console.log(encodeURIComponent(galleryID));

  let requestString = `${API_URL()}model/download_model_from_gallery?gallery_id=${encodeURIComponent(
    galleryID,
  )}`;
  if (job_id) {
    requestString += `&job_id=${job_id}`;
  }
  const response = await fetch(requestString);
  const result = await response.json();

  return result;
}

// Return the models that the controller can see
export async function activeModels() {
  let response;
  try {
    response = await fetch(`${API_URL()}v1/models`);
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching active models', error);
    return null;
  }
}

// Right now health function is the same as activeModels
// But later we can add a health endpoint to the API
export async function apiHealthz() {
  let response;
  try {
    response = await fetch(`${API_URL()}healthz`);
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching API', error);
    return null;
  }
}

export async function controllerHealthz() {
  let response;
  try {
    // For now we hard code the worker to the default FastChat API port of 21002
    response = await fetch(API_URL() + 'v1/models', {
      method: 'GET',
    });
    if (response.ok) {
      const result = await response.json();
      return result;
    }
    return null;
  } catch (error) {
    console.log('error with fetch', error);
    return null;
  }
}

export async function localaiHealthz() {
  let response;
  try {
    response = await fetch(API_URL() + 'v1/models');
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetch', error);
    return null;
  }
}

export async function getComputerInfo() {
  let response;
  try {
    response = await fetch(API_URL() + 'server/info');
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching computer info', error);
    return null;
  }
}

export async function activateWorker(
  modelName: string,
  modelFilename: string | null = null,
  adaptorName: string = '',
  engine: string | null = 'default',
  parameters: object = {},
  experimentId: string = '',
) {
  let response;

  let model = modelName;
  // if (adaptorName !== '') {
  //   model = `workspace/adaptors/${modelName}/${adaptorName}`;
  // }

  if (modelFilename !== null) {
    model = `${model}&model_filename=${modelFilename}`;
  }

  const paramsJSON = JSON.stringify(parameters);

  try {
    response = await fetch(
      API_URL() +
        'server/worker_start?model_name=' +
        model +
        '&adaptor=' +
        adaptorName +
        '&engine=' +
        engine +
        '&experiment_id=' +
        experimentId +
        '&parameters=' +
        paramsJSON,
    );
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with starting worker api call ', error);
    return undefined;
  }
}

export async function killWorker() {
  let response;
  try {
    response = await fetch(API_URL() + 'server/worker_stop');
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with killing worker api call ', error);
    return undefined;
  }
}
