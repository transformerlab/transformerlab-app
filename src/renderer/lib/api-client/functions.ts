import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { API_URL } from './urls';
import { fetchWithAuth } from '../authContext';

// Helper function to create authenticated fetch requests
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
) {
  return fetchWithAuth(url, options);
}

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
    const response = await authenticatedFetch(requestString);
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

export async function downloadGGUFFile(
  modelId: string,
  filename: string,
  job_id = null,
) {
  let requestString = `${API_URL()}model/download_gguf_file?model=${encodeURIComponent(
    modelId,
  )}&filename=${encodeURIComponent(filename)}`;
  if (job_id) {
    requestString += `&job_id=${job_id}`;
  }

  let result = {};
  try {
    const response = await authenticatedFetch(requestString);
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
  const response = await authenticatedFetch(requestString);
  const result = await response.json();

  return result;
}

// Return the models that the controller can see
export async function activeModels() {
  let response;
  try {
    // Pass just the path - fetchWithAuth will handle prepending the base URL
    response = await authenticatedFetch('v1/models');
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
    // Pass just the path - fetchWithAuth will handle prepending the base URL
    response = await authenticatedFetch('healthz');
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
    // Pass just the path - fetchWithAuth will handle prepending the base URL
    response = await authenticatedFetch('v1/models', {
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
    // Pass just the path - fetchWithAuth will handle prepending the base URL
    response = await authenticatedFetch('v1/models');
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
    // Pass just the path - fetchWithAuth will handle prepending the base URL
    response = await authenticatedFetch('server/info');
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
  modelArchitecture: string = '',
  adaptorName: string = '',
  engine: string | null = 'default',
  parameters: object = {},
  experimentId: string = '',
) {
  let response;

  const paramsJSON = JSON.stringify(parameters);

  try {
    // Pass just the path with query params - fetchWithAuth will handle prepending the base URL
    const queryParams = new URLSearchParams({
      model_name: modelName,
      adaptor: adaptorName || '',
      model_architecture: modelArchitecture || '',
      inference_engine: engine || 'default',
      experiment_id: experimentId || '',
      inference_params: paramsJSON,
    });

    if (modelFilename !== null && modelFilename !== '') {
      queryParams.set('model_filename', modelFilename);
    }

    const queryString = `server/worker_start?${queryParams.toString()}`;
    response = await authenticatedFetch(queryString);
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
    // Pass just the path - fetchWithAuth will handle prepending the base URL
    response = await authenticatedFetch('server/worker_stop');
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with killing worker api call ', error);
    return undefined;
  }
}

export function GET_EXPERIMENT_UPDATE_CONFIG_URL(
  id: string,
  key: string,
  value: string | undefined,
) {
  if (value === undefined) {
    value = '';
  }
  return (
    API_URL() +
    'experiment/' +
    id +
    '/update_config' +
    '?key=' +
    key +
    '&value=' +
    value
  );
}

export async function EXPERIMENT_ADD_EVALUATION(
  id: string,
  name: string,
  pluginId: string,
  scriptParameters: any,
) {
  const newPlugin = {
    name: name,
    plugin: pluginId,
    script_parameters: scriptParameters,
  };

  const response = await authenticatedFetch(
    API_URL() + 'experiment/' + id + '/evals/add',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_EDIT_EVALUATION(
  id: string,
  evalName: string,
  scriptParameters: any,
) {
  const newPlugin = {
    evalName: evalName,
    script_parameters: scriptParameters,
  };

  const response = await authenticatedFetch(
    API_URL() + 'experiment/' + id + '/evals/edit',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_ADD_GENERATION(
  id: string,
  name: string,
  pluginId: string,
  scriptParameters: any,
) {
  const newPlugin = {
    name: name,
    plugin: pluginId,
    script_parameters: scriptParameters,
  };

  const response = await authenticatedFetch(
    API_URL() + 'experiment/' + id + '/generations/add',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_EDIT_GENERATION(
  id: string,
  evalName: string,
  scriptParameters: any,
) {
  const newPlugin = {
    evalName: evalName,
    script_parameters: scriptParameters,
  };

  const response = await authenticatedFetch(
    API_URL() + 'experiment/' + id + '/generations/edit',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export function TEMPLATE_FOR_MODEL_URL(model: string) {
  return `${API_URL()}model/get_conversation_template?model=${model}`;
}

export async function getTemplateForModel(modelName: string) {
  if (!modelName) {
    return null;
  }
  const model = modelName.split('/')[1];
  const response = await authenticatedFetch(TEMPLATE_FOR_MODEL_URL(model));
  const result = await response.json();

  return result;
}
