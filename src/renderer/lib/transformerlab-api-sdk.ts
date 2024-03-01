/* eslint-disable prefer-template */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */

/** This SDK manages all connection to the transformerlab api
 *
 * There are several ways this SDK enables connections
 * 1) Functions like sendAndReceive talk directly to the API
 *    support complex communication back and forth with the
 *    API
 *
 * 2) Functions under ENDPOINTS are mappings to URLs on the
 *    API. The reason we have these is that we heavily use
 *    SWR in React and SWR works by using the specific
 *    endpoint URLs on the API as Keys for caching and
 *    managing state. So instead of abstracting the calling
 *    of APIs, this SDK sends back the URLs and let's SWR
 *    call them directly. We could improve this later by
 *    bringing the SWR Fetcher functions into this SDK
 *    and somehow generating our own keys
 *
 * 3) We have a few SWR functions that start with use___
 *    like useServerStats that are SWR events that use
 *    SWR to do more complicated things like polling
 *
 *
 * But the key to this whole file is that all talking to
 * the API is captured here, so that the rest of the app
 * does not need to know any API specifics
 * */

import useSWR from 'swr';

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

export async function sendAndReceive(
  currentModel: String,
  texts: any,
  temperature: number,
  maxTokens: number,
  topP: number,
  systemMessage: string
) {
  const shortModelName = currentModel.split('/').slice(-1)[0];

  let messages = [];
  messages.push({ role: 'system', content: systemMessage });
  messages = messages.concat(texts);

  const data = {
    model: shortModelName,
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    system_message: systemMessage,
  };

  let result;

  try {
    const response = await fetch(
      `${INFERENCE_SERVER_URL()}v1/chat/completions`,
      {
        method: 'POST', // or 'PUT'
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(data),
      }
    );
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  if (result.choices) {
    return { id: result.id, text: result.choices[0].message.content };
  }
  return null;
}

export async function sendAndReceiveStreaming(
  currentModel: string,
  currentAdaptor: string,
  texts: any,
  temperature: number,
  maxTokens: number,
  topP: number,
  freqencyPenalty: number,
  systemMessage: string
) {
  let shortModelName = currentModel.split('/').slice(-1)[0];

  if (currentAdaptor && currentAdaptor !== '') {
    shortModelName = currentAdaptor;
  }

  let messages = [];
  messages.push({ role: 'system', content: systemMessage });
  messages = messages.concat(texts);

  const data = {
    model: shortModelName,
    stream: true, // For streaming responses
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    frequency_penalty: freqencyPenalty,
    system_message: systemMessage,
  };

  let result;
  var id = Math.random() * 1000;

  const resultText = document.getElementById('resultText');
  if (resultText) resultText.innerText = '';

  let response;
  try {
    response = await fetch(`${INFERENCE_SERVER_URL()}v1/chat/completions`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.log('Exception accessing completions API:', error);
    alert('Network connection error');
    return null;
  }

  // if invalid response then return now
  if (!response.ok) {
    const response_json = await response.json();
    console.log('Completions API response:', response_json);
    const error_text = `Completions API Error
      HTTP Error Code: ${response?.status}
      ${response_json?.message}`;
    alert(error_text);
    return null;
  }

  // Read the response as a stream of data
  const reader = response?.body?.getReader();
  const decoder = new TextDecoder('utf-8');

  let finalResult = '';

  var start = performance.now();
  var firstTokenTime = null;
  var end = start;

  // Reader loop
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();

      if (firstTokenTime == null) firstTokenTime = performance.now();

      if (done) {
        break;
      }
      // Massage and parse the chunk of data
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      let parsedLines = [];
      //console.log(lines);
      try {
        parsedLines = lines
          .map((line) => line.replace(/^data: /, '').trim()) // Remove the "data: " prefix
          .filter((line) => line !== '' && line !== '[DONE]') // Remove empty lines and "[DONE]"
          .map((line) => JSON.parse(line)); // Parse the JSON string
      } catch (error) {
        console.log('error parsing line', error);
      }
      // console.log(parsedLines);

      // eslint-disable-next-line no-restricted-syntax
      for (const parsedLine of parsedLines) {
        const { choices } = parsedLine;
        const { delta } = choices[0];
        const { content } = delta;
        id = parsedLine.id;
        // Update the UI with the new content
        if (content) {
          finalResult += content;
          if (resultText) {
            resultText.innerText = finalResult;
            resultText.scrollIntoView();
          }
        }
      }
    }

    result = finalResult;
  } catch (error) {
    console.log('There was an error:', error);
  }

  // Stop clock:
  end = performance.now();
  var time = end - firstTokenTime;
  var timeToFirstToken = firstTokenTime - start;

  if (result) {
    if (resultText) resultText.innerText = '';
    return {
      id: id,
      text: result,
      time: time,
      timeToFirstToken: timeToFirstToken,
    };
  }
  return null;
}

export async function sendCompletion(
  currentModel: string,
  adaptor: string,
  text: string,
  temperature: number = 0.7,
  maxTokens: number = 256,
  topP: number = 1.0,
  useLongModelName = true
) {
  let model = '';

  if (useLongModelName) {
    model = currentModel;
  } else {
    model = currentModel.split('/').slice(-1)[0];
  }

  if (adaptor && adaptor !== '') {
    model = adaptor;
  }

  console.log('model', model);

  const data = {
    model: model,
    stream: false, // For streaming responses
    prompt: text,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
  };

  let result;

  try {
    const response = await fetch(`${INFERENCE_SERVER_URL()}v1/completions`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  if (result?.choices) {
    return { id: result?.id, text: result?.choices?.[0]?.text };
  }
  return null;
}

export async function getAvailableModels() {
  const response = await fetch(API_URL() + 'model/gallery');
  const result = await response.json();
  return result;
}

export async function downloadModelFromHuggingFace(modelName: string) {
  let result = {};
  try {
    const response = await fetch(
      `${API_URL()}model/download_from_huggingface?model=${encodeURIComponent(
        modelName
      )}`
    );
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
  job_id = null
) {
  console.log(encodeURIComponent(galleryID));

  let requestString = `${API_URL()}model/download_model_from_gallery?gallery_id=${encodeURIComponent(
    galleryID
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

/**
 * Pass an array of strings, and this will
 * return an array of embeddings
 */
export async function getEmbeddings(model: string, text: string[]) {
  let shortModelName = model.split('/').slice(-1)[0];

  let result;

  const data = {
    model: shortModelName,
    input: text,
  };

  try {
    const response = await fetch(`${API_URL()}v1/embeddings`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  return result;
}

/**
 * Count tokens in a provided messages array
 */
export async function countTokens(model: string, text: string[]) {
  if (!model) return 0;

  let shortModelName = model.split('/').slice(-1)[0];

  let result;

  const prompts = [
    {
      model: shortModelName,
      prompt: text[0],
      max_tokens: 0,
    },
  ];

  const data = {
    prompts: prompts,
  };

  try {
    const response = await fetch(`${API_URL()}api/v1/token_check`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  return result?.prompts?.[0];
}

/**
 * Count tokens in a provided messages array
 */
export async function countChatTokens(model: string, text: any) {
  if (!model) return 0;

  let shortModelName = model.split('/').slice(-1)[0];

  let messages = [];
  messages = messages.concat(text);

  const data = {
    model: shortModelName,
    messages,
  };

  let result;

  try {
    const response = await fetch(`${API_URL()}v1/chat/count_tokens`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  return result;
}

export let Endpoints: any = {};

// We do this because the API does not like slashes in the URL
function convertSlashInUrl(url: string) {
  return url.replace(/\//g, '~~~');
}

Endpoints.Dataset = {
  Gallery: () => API_URL() + 'data/gallery',
  Info: (datasetId: string) => API_URL() + 'data/info?dataset_id=' + datasetId,
  Preview: (datasetId: string) =>
    API_URL() + 'data/preview?dataset_id=' + datasetId,
  Delete: (datasetId: string) =>
    API_URL() + 'data/delete?dataset_id=' + datasetId,
  Create: (datasetId: string) => API_URL() + 'data/new?dataset_id=' + datasetId,
  Download: (datasetId: string) =>
    API_URL() + 'data/download?dataset_id=' + datasetId,
  LocalList: () => API_URL() + 'data/list',
  FileUpload: (datasetId: string) =>
    API_URL() + 'data/fileupload?dataset_id=' + datasetId,
};

Endpoints.Models = {
  LocalList: () => API_URL() + 'model/list',
  Gallery: () => API_URL() + 'model/gallery',
  GetPeftsForModel: () => API_URL() + 'model/pefts',
  DeletePeft: (modelId: string, peft: string) =>
    API_URL() + 'model/delete_peft?model_id=' + modelId + '&peft=' + peft,
  ModelDetailsFromGallery: (modelId: string) =>
    API_URL() + 'model/gallery/' + convertSlashInUrl(modelId),
  ModelDetailsFromFilesystem: (modelId: string) =>
    API_URL() + 'model/details/' + convertSlashInUrl(modelId),
  HuggingFaceLogin: () => API_URL() + 'model/login_to_huggingface',
  Delete: (modelId: string) => API_URL() + 'model/delete?model_id=' + modelId,
};

Endpoints.Plugins = {
  Gallery: () => API_URL() + 'plugins/gallery',
  Info: (pluginId: string) => API_URL() + 'plugins/info?plugin_id=' + pluginId,
  Preview: (pluginId: string) =>
    API_URL() + 'plugins/preview?pluginId=' + pluginId,
  List: () => API_URL() + 'plugins/list',
};

Endpoints.Config = {
  Get: (key: string) => API_URL() + 'config/get/' + key,
  Set: (key: string, value: string) =>
    API_URL() + 'config/set?k=' + key + '&v=' + value,
};

export function GET_TRAINING_TEMPLATE_URL() {
  return API_URL() + 'train/templates';
}

export function CREATE_TRAINING_JOB_URL(
  template_id: string,
  experiment_id: string
) {
  return (
    API_URL() +
    'train/job/create?template_id=' +
    template_id +
    '&description=description' +
    '&experiment_id=' +
    experiment_id
  );
}

Endpoints.Experiment = {
  GetAll: () => API_URL() + 'experiment',
  UpdateConfig: (id: string, key: string, value: string) =>
    API_URL() +
    'experiment/' +
    id +
    '/update_config' +
    '?key=' +
    key +
    '&value=' +
    value,
  Create: (name: string) => API_URL() + 'experiment/create?name=' + name,
  Get: (id: string) => API_URL() + 'experiment/' + id,
  Delete: '',
  SavePrompt: '',
  GetFile: (id: string, filename: string) =>
    API_URL() + 'experiment/' + id + '/file_contents?filename=' + filename,
  SaveFile: (id: string, filename: string) =>
    API_URL() + 'experiment/' + id + '/save_file_contents?filename=' + filename,
  GetPlugin: (id: string, plugin_name: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/get_evaluation_plugin_file_contents?plugin_name=' +
      plugin_name
    );
  },
  RunEvaluation: (id: string, pluginName: string, evalName: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/run_evaluation_script?eval_name=' +
      evalName +
      '&plugin_name=' +
      pluginName
    );
  },
  DeleteEval: (experimentId: string, evalName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/delete_eval_from_experiment' +
    '?eval_name=' +
    evalName,
  RunExport: (
    id: string,
    pluginName: string,
    pluginArchitecture: string,
    pluginParams: string
  ) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/run_exporter_script?plugin_name=' +
      pluginName +
      '&plugin_architecture=' +
      pluginArchitecture +
      '&plugin_params=' +
      pluginParams
    );
  },
  GetExportJobs: (id: string) => {
    return API_URL() + 'experiment/' + id + '/export/jobs';
  },
  GetExportJobDetails: (experimentId: string, jobId: string) => {
    return (
      API_URL() + 'experiment/' + experimentId + '/export/job?jobId=' + jobId
    );
  },
  SaveConversation: (experimentId: String) =>
    API_URL() + 'experiment/' + experimentId + '/save_conversation',
  GetConversations: (experimentId: string) =>
    FULL_PATH('experiment/' + experimentId + '/get_conversations'),
  DeleteConversation: (experimentId: string, conversationId: string) =>
    FULL_PATH(
      'experiment/' +
        experimentId +
        '/delete_conversation?conversation_id=' +
        conversationId
    ),
  InstallPlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/install_plugin_to_experiment' +
    '?plugin_name=' +
    pluginId,
  DeletePlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/delete_plugin_from_experiment' +
    '?plugin_name=' +
    pluginId,
  ListScripts: (experimentId: string) =>
    FULL_PATH('experiment/' + experimentId + '/scripts/list'),
  ListScriptsOfType: (
    experimentId: string,
    type: string,
    filter: string | null = null
  ) =>
    FULL_PATH(
      'experiment/' +
        experimentId +
        '/scripts/list?type=' +
        type +
        (filter ? '&filter=' + filter : '')
    ),
  ScriptListFiles: (experimentId: string, id: string) =>
    API_URL() + 'experiment/' + experimentId + '/scripts/' + id + '/list_files',
  ScriptGetFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/scripts/' +
    pluginId +
    '/file_contents?filename=' +
    filename,
  ScriptNewFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/scripts/' +
    pluginId +
    '/create_new_file?filename=' +
    filename,
  ScriptDeleteFile: (
    experimentId: string,
    pluginId: string,
    filename: string
  ) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/scripts/' +
    pluginId +
    '/delete_file?filename=' +
    filename,
  ScriptSaveFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/scripts/' +
    pluginId +
    '/save_file_contents?filename=' +
    filename,
  ScriptCreateNew: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/scripts/new_plugin?pluginId=' +
    pluginId,
  ScriptDeletePlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    'plugins/delete_plugin?pluginId=' +
    pluginId,
  GetOutputFromJob: (jobId: string) => API_URL() + `train/job/${jobId}/output`,
};

Endpoints.Jobs = {
  List: () => API_URL() + 'train/jobs',
  Get: (jobId: string) => API_URL() + 'train/job/' + jobId,
  Create: (templateId: string, experimentId: string) =>
    API_URL() + 'jobs/create',
};

export function GET_EXPERIMENTS_URL() {
  return API_URL() + 'experiment';
}

export function GET_EXPERIMENT_UPDATE_CONFIG_URL(
  id: string,
  key: string,
  value: string | undefined
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
  scriptParameters: any
) {
  const newPlugin = {
    name: name,
    plugin: pluginId,
    script_parameters: scriptParameters,
  };

  const response = await fetch(
    API_URL() + 'experiment/' + id + '/add_evaluation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    }
  );
  const result = await response.json();
  return result;
}

export function CREATE_EXPERIMENT_URL(name: string) {
  return API_URL() + 'experiment/create?name=' + name;
}

export function GET_EXPERIMENT_URL(id: string) {
  if (id === '') {
    return '';
  }
  return API_URL() + 'experiment/' + id;
}

export function DELETE_EXPERIMENT_URL(id: string) {
  return API_URL() + 'experiment/' + id + '/delete';
}

export function SAVE_EXPERIMENT_PROMPT_URL(id: string) {
  return API_URL() + 'experiment/' + id + '/prompt';
}

export async function getAvailableData() {
  const response = await fetch(Endpoints.Dataset.Gallery());
  const result = await response.json();
  return result;
}

export async function downloadData(datasetId: string) {
  const response = await fetch(
    API_URL() + 'data/download?dataset_id=' + datasetId
  );
  const result = await response.json();
  return result;
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

export function activateLocalAI(): void {
  window.electron.ipcRenderer.sendMessage('spawn-start-localai');
}

export async function activateController() {
  let response;
  try {
    response = await fetch(API_URL() + 'server/controller_start');
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with starting controller', error);
    return undefined;
  }
}

export async function activateWorker(
  modelName: string,
  modelFilename: string | null = null,
  adaptorName: string = '',
  engine: string | null = 'default',
  parameters: object = {},
  experimentId: string = ''
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
        paramsJSON
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

export function activateTransformerLabAPI(): void {
  window.electron.ipcRenderer.sendMessage('spawn-start-transformerlab-api');
}

export async function startFinetune(
  modelName: string,
  adaptorName: string,
  trainingData: string
) {
  const response = await fetch(
    `${API_URL()}train/finetune_lora?model=${modelName}&adaptor_name=${adaptorName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(trainingData),
    }
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
  const response = await fetch(TEMPLATE_FOR_MODEL_URL(model));
  const result = await response.json();

  return result;
}

/** ***********************
 * TRAINING AND TRAINING JOBS
 */

export async function saveTrainingTemplate(
  name: string,
  description: string,
  type: string,
  config: string
) {
  // template_id: str, description: str, type: str, datasets: str, config: str

  const queryString = `?name=${name}&description=${description}&type=${type}`;

  const configBody = {
    config: config,
  };
  const response = await fetch(
    API_URL() + 'train/template/create' + queryString,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(configBody),
    }
  );
  const result = await response.json();
  return result;
}
export async function getTrainingJobs() {
  const response = await fetch(API_URL() + 'train/list');
  const result = await response.json();
  return result;
}

export async function getTrainingJobStatus(jobId: string) {
  const response = await fetch(API_URL() + 'train/status?job_id=' + jobId);
  const result = await response.json();
  return result;
}

/**
 * SWR hooks
 */

const fetcher = (...args: any[]) => fetch(...args).then((res) => res.json());

export function useModelStatus() {
  const url = API_URL() + 'server/worker_healthz';

  // Poll every 2 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, error, isLoading, mutate } = useSWR(url, fetcher, options);

  if (data?.length === 0) {
    data = null;
  }

  return {
    models: data,
    isLoading,
    isError: error,
    mutate: mutate,
  };
}

export function usePluginStatus(experimentInfo: any) {
  let { data } = useSWR(
    experimentInfo ? Endpoints.Experiment.ListScripts(experimentInfo?.id) : null,
    fetcher
  );

  let outdatedPluginsCount = null;
  if (data) {
    outdatedPluginsCount = data.filter((plugin: any) => plugin?.gallery_version && plugin?.version != plugin?.gallery_version).length;
  }
  
  return { outdatedPluginsCount };
}

export function useServerStats() {
  const url = API_URL() + 'server/info';

  // Poll every 1 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, error, isLoading } = useSWR(url, fetcher, options);

  return {
    server: data,
    isLoading,
    isError: error,
  };
}

export async function downloadPlugin(pluginId: string) {
  const response = await fetch(
    API_URL() + 'plugins/download?plugin_slug=' + pluginId
  );
  const result = await response.json();
  return result;
}

async function fetchAndGetErrorStatus(url) {
  const res = await fetch(url);

  // If the status code is not in the range 200-299,
  // we still try to parse and throw it.
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    // Attach extra info to the error object.
    // error.info = await res.json(); //uncommenting this line breaks the error handling -- not sure why
    error.status = res.status;
    throw error;
  }

  return res.json();
}

/**
 * Check your localhost to see if the server is active
 */
export function useCheckLocalConnection() {
  const url = 'http://localhost:8000/' + 'server/info';

  // Poll every 2 seconds
  const options = {
    refreshInterval: 1000,
    refreshWhenOffline: true,
    refreshWhenHidden: true,
  };

  // eslint-disable-next-line prefer-const
  let { data, error, isLoading } = useSWR(url, fetchAndGetErrorStatus, options);

  return {
    server: data,
    isLoading,
    error,
  };
}
