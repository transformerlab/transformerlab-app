/* eslint-disable camelcase */
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

import { API_URL, INFERENCE_SERVER_URL, FULL_PATH } from './api-client/urls';

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

export const Endpoints: any = {};

// We do this because the API does not like slashes in the URL
function convertSlashInUrl(url: string) {
  return url.replace(/\//g, '~~~');
}

Endpoints.Tasks = {
  List: () => API_URL() + 'tasks/list',
  ListByType: (type: string) => API_URL() + 'tasks/list_by_type?type=' + type,
  ListByTypeInExperiment: (type: string, experiment_id: string) =>
    API_URL() +
    'tasks/list_by_type_in_experiment?type=' +
    type +
    '&experiment_id=' +
    experiment_id,
  Queue: (id: string) => API_URL() + 'tasks/' + id + '/queue',
  GetByID: (id: string) => API_URL() + 'tasks/' + id + '/get',
  UpdateTask: (id: string) => API_URL() + 'tasks/' + id + '/update',
  NewTask: () => API_URL() + 'tasks/new_task',
  DeleteTask: (id: string) => API_URL() + 'tasks/' + id + '/delete',
};

Endpoints.Workflows = {
  List: () => API_URL() + 'workflows/list',
  CreateEmpty: (name: string, experimentId: string) =>
    API_URL() +
    'workflows/create_empty' +
    '?name=' +
    name +
    '&experiment_id=' +
    experimentId,
  UpdateName: (workflowId: string, new_name: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/update_name' +
    '?new_name=' +
    new_name,
  DeleteWorkflow: (workflowId: string) =>
    API_URL() + 'workflows/delete/' + workflowId,
  AddNode: (workflowId: string, node: string) =>
    API_URL() + 'workflows/' + workflowId + '/add_node' + '?node=' + node,
  DeleteNode: (workflowId: string, nodeId: string) =>
    API_URL() + 'workflows/' + workflowId + '/' + nodeId + '/delete_node',
  UpdateNode: (workflowId: string, nodeId: string, node: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/' +
    nodeId +
    '/update_node' +
    '?node=' +
    node,
  EditNodeMetadata: (workflowId: string, nodeId: string, metadata: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/' +
    nodeId +
    '/edit_node_metadata' +
    '?metadata=' +
    metadata,
  AddEdge: (workflowId: string, from: string, to: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/' +
    from +
    '/add_edge' +
    '?end_node_id=' +
    to,
  RemoveEdge: (workflowId: string, start_node_id: string, to: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/' +
    start_node_id +
    '/remove_edge' +
    '?end_node_id=' +
    to,
  RunWorkflow: (workflowId: string) =>
    API_URL() + 'workflows/' + workflowId + '/start',
  ListRuns: () => API_URL() + 'workflows/list_runs',
  GetRun: (workflowRunID: string) =>
    API_URL() + 'workflows/runs/' + workflowRunID,
};

Endpoints.Dataset = {
  Gallery: () => API_URL() + 'data/gallery',
  Info: (datasetId: string) => API_URL() + 'data/info?dataset_id=' + datasetId,
  Preview: (
    datasetId: string,
    split: string = '',
    offset: number = 0,
    limit: number = 10,
  ) =>
    API_URL() +
    'data/preview?dataset_id=' +
    datasetId +
    '&split=' +
    split +
    '&offset=' +
    offset +
    '&limit=' +
    limit,
  PreviewWithTemplate: (
    datasetId: string,
    template: string,
    offset: number,
    limit: number,
  ) =>
    API_URL() +
    'data/preview_with_template?dataset_id=' +
    datasetId +
    '&template=' +
    template +
    '&offset=' +
    offset +
    '&limit=' +
    limit,
  Delete: (datasetId: string) =>
    API_URL() + 'data/delete?dataset_id=' + datasetId,
  Create: (datasetId: string) => API_URL() + 'data/new?dataset_id=' + datasetId,
  Download: (datasetId: string, configName?: string) =>
    API_URL() +
    'data/download?dataset_id=' +
    datasetId +
    (configName ? '&config_name=' + configName : ''),
  LocalList: (generated: boolean = true) =>
    API_URL() + 'data/list?generated=' + generated,
  GeneratedList: () => API_URL() + 'data/generated_datasets_list',
  FileUpload: (datasetId: string) =>
    API_URL() + 'data/fileupload?dataset_id=' + datasetId,
};

Endpoints.Models = {
  LocalList: () => API_URL() + 'model/list',
  CountDownloaded: () => API_URL() + 'model/count_downloaded',
  Gallery: () => API_URL() + 'model/gallery',
  GetPeftsForModel: () => API_URL() + 'model/pefts',
  UploadModelToHuggingFace: (
    modelId: string,
    modelName: string,
    organizationName?: string,
    model_card_data?: object,
  ) =>
    API_URL() +
    'model/upload_to_huggingface?model_id=' +
    modelId +
    '&model_name=' +
    modelName +
    '&organization_name=' +
    organizationName +
    '&model_card_data=' +
    JSON.stringify(model_card_data),
  DeletePeft: (modelId: string, peft: string) =>
    API_URL() + 'model/delete_peft?model_id=' + modelId + '&peft=' + peft,
  ModelDetailsFromGallery: (modelId: string) =>
    API_URL() + 'model/gallery/' + convertSlashInUrl(modelId),
  ModelDetailsFromFilesystem: (modelId: string) =>
    API_URL() + 'model/details/' + convertSlashInUrl(modelId),
  ModelProvenance: (modelId: string) =>
    API_URL() + 'model/provenance/' + convertSlashInUrl(modelId),
  GetLocalHFConfig: (modelId: string) =>
    API_URL() + 'model/get_local_hfconfig?model_id=' + modelId,
  SearchForLocalUninstalledModels: (path: string) =>
    API_URL() + 'model/list_local_uninstalled?path=' + path,
  ImportFromSource: (modelSource: string, modelId: string) =>
    API_URL() +
    'model/import_from_source?model_source=' +
    modelSource +
    '&model_id=' +
    modelId,

  ImportFromLocalPath: (modelPath: string) =>
    API_URL() + 'model/import_from_local_path?model_path=' + modelPath,
  HuggingFaceLogin: () => API_URL() + 'model/login_to_huggingface',
  Delete: (modelId: string, deleteCache: boolean = false) =>
    API_URL() +
    'model/delete?model_id=' +
    modelId +
    '&delete_from_cache=' +
    deleteCache,
  wandbLogin: () => API_URL() + 'model/login_to_wandb',
  testWandbLogin: () => API_URL() + 'model/test_wandb_login',
};

Endpoints.Plugins = {
  Gallery: () => API_URL() + 'plugins/gallery',
  Info: (pluginId: string) => API_URL() + 'plugins/info?plugin_id=' + pluginId,
  Preview: (pluginId: string) =>
    API_URL() + 'plugins/preview?pluginId=' + pluginId,
  List: () => API_URL() + 'plugins/list',
  RunPluginInstallScript: (pluginId: string) =>
    API_URL() + 'plugins/' + pluginId + '/run_installer_script',
};

Endpoints.Config = {
  Get: (key: string) => API_URL() + 'config/get/' + key,
  Set: (key: string, value: string) =>
    API_URL() + 'config/set?k=' + key + '&v=' + value,
};

Endpoints.Documents = {
  List: (experimentId: string, currentFolder: string = '') =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/list?folder=' +
    currentFolder,
  Open: (experimentId: string, document_name: string, folder: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/open/' +
    document_name +
    '?folder=' +
    folder,
  Upload: (experimentId: string, currentFolder: string = '') =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/upload?folder=' +
    currentFolder,
  Delete: (experimentId: string, document_name: string, folder: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/delete?document_name=' +
    document_name +
    '&folder=' +
    folder,
  CreateFolder: (experimentId: string, folderName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/create_folder?name=' +
    folderName,
  UploadLinks: (experimentId: string, folderName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/upload_links?folder=' +
    folderName,
};

Endpoints.Rag = {
  Query: (
    experimentId: string,
    model_name: string,
    query: string,
    settings: string,
    ragFolder: string = 'rag',
  ) =>
    API_URL() +
    `experiment/${experimentId}/rag/query?model=${model_name}&query=${query}&settings=${settings}&rag_folder=${ragFolder}`,
  ReIndex: (experimentId: string, folderName: string = 'rag') =>
    API_URL() +
    `experiment/${experimentId}/rag/reindex?rag_folder=${folderName}`,
  Embeddings: (experimentId: string) =>
    API_URL() + `experiment/${experimentId}/rag/embed`,
};

Endpoints.Prompts = {
  List: () => API_URL() + 'prompts/list',
  New: () => API_URL() + 'prompts/new',
  Delete: (promptId: string) => API_URL() + 'prompts/delete/' + promptId,
};

Endpoints.BatchedPrompts = {
  List: () => API_URL() + 'batch/list',
  New: () => API_URL() + 'batch/new',
  Delete: (promptId: string) => API_URL() + 'batch/delete/' + promptId,
};

Endpoints.Tools = {
  Call: (function_name: string, function_arguments: string) =>
    API_URL() + `tools/call/${function_name}?params=${function_arguments}`,
  Prompt: () => API_URL() + `tools/prompt`,
  List: () => API_URL() + `tools/list`,
};

Endpoints.Recipes = {
  Import: (name: string) =>
    API_URL() + 'train/template/import?name=' + encodeURIComponent(name),
  Export: (template_id: int) =>
    API_URL() + 'train/template/' + template_id + '/export',
  Gallery: () => API_URL() + 'train/template/gallery',
};

Endpoints.ServerInfo = {
  Get: () => API_URL() + 'server/info',
  PythonLibraries: () => API_URL() + 'server/python_libraries',
  StreamLog: () => API_URL() + 'server/stream_log',
};

Endpoints.Charts = {
  CompareEvals: (jobIds: string) =>
    API_URL() + 'evals/compare_evals?job_list=' + jobIds,
};

export function GET_TRAINING_TEMPLATE_URL() {
  return API_URL() + 'train/templates';
}

export function CREATE_TRAINING_JOB_URL(
  template_id: string,
  experiment_id: string,
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
  GetAll: () => API_URL() + 'experiment/',
  UpdateConfig: (id: string, key: string, value: string) =>
    API_URL() +
    'experiment/' +
    id +
    '/update_config' +
    '?key=' +
    key +
    '&value=' +
    encodeURIComponent(value),
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
      '/evals/get_evaluation_plugin_file_contents?plugin_name=' +
      plugin_name
    );
  },
  GetGenerationPlugin: (id: string, plugin_name: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/generations/get_evaluation_plugin_file_contents?plugin_name=' +
      plugin_name
    );
  },
  RunEvaluation: (id: string, pluginName: string, evalName: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/evals/run_evaluation_script?eval_name=' +
      evalName +
      '&plugin_name=' +
      pluginName
    );
  },
  RunGeneration: (id: string, pluginName: string, evalName: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/generations/run_generation_script?generation_name=' +
      evalName +
      '&plugin_name=' +
      pluginName
    );
  },
  DeleteEval: (experimentId: string, evalName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/evals/delete' +
    '?eval_name=' +
    evalName,
  DeleteGeneration: (experimentId: string, evalName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/generations/delete' +
    '?generation_name=' +
    evalName,
  GetEvalOutput: (experimentId: string, eval_name: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/evals/get_output' +
    '?eval_name=' +
    eval_name,
  GetGenerationOutput: (experimentId: string, eval_name: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/generations/get_output' +
    '?eval_name=' +
    eval_name,
  RunExport: (
    id: string,
    pluginName: string,
    pluginArchitecture: string,
    pluginParams: string,
  ) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/export/run_exporter_script?plugin_name=' +
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
    API_URL() + 'experiment/' + experimentId + '/conversations/save',
  GetConversations: (experimentId: string) =>
    FULL_PATH('experiment/' + experimentId + '/conversations/list'),
  DeleteConversation: (experimentId: string, conversationId: string) =>
    FULL_PATH(
      'experiment/' +
        experimentId +
        '/conversations/delete?conversation_id=' +
        conversationId,
    ),
  InstallPlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/install_plugin_to_experiment' +
    '?plugin_name=' +
    pluginId,
  DeletePlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/delete_plugin_from_experiment' +
    '?plugin_name=' +
    pluginId,
  ListScripts: (experimentId: string) =>
    FULL_PATH('experiment/' + experimentId + '/plugins/list'),
  ListScriptsOfType: (
    experimentId: string,
    type: string,
    filter: string | null = null,
  ) =>
    FULL_PATH(
      'experiment/' +
        experimentId +
        '/plugins/list?type=' +
        type +
        (filter ? '&filter=' + filter : ''),
    ),
  ScriptListFiles: (experimentId: string, id: string) =>
    API_URL() + 'experiment/' + experimentId + '/plugins/' + id + '/list_files',
  ScriptGetFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/' +
    pluginId +
    '/file_contents?filename=' +
    filename,
  ScriptNewFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/' +
    pluginId +
    '/create_new_file?filename=' +
    filename,
  ScriptDeleteFile: (
    experimentId: string,
    pluginId: string,
    filename: string,
  ) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/' +
    pluginId +
    '/delete_file?filename=' +
    filename,
  ScriptSaveFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/' +
    pluginId +
    '/save_file_contents?filename=' +
    filename,
  ScriptCreateNew: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/new_plugin?pluginId=' +
    pluginId,
  ScriptDeletePlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    'plugins/delete_plugin?pluginId=' +
    pluginId,
  GetOutputFromJob: (jobId: string) => API_URL() + `train/job/${jobId}/output`,
  StreamOutputFromTrainingJob: (jobId: string) =>
    API_URL() + `train/job/${jobId}/stream_output`,
  StreamOutputFromJob: (jobId: string) =>
    API_URL() + `jobs/${jobId}/stream_output`,
  StreamDetailedJSONReportFromJob: (jobId: string, fileName: string) =>
    API_URL() +
    `jobs/${jobId}/stream_detailed_json_report?file_name=${fileName}`,
  GetAdditionalDetails: (jobId: string, task: string = 'view') =>
    API_URL() + `jobs/${jobId}/get_additional_details?task=${task}`,
  GetGeneratedDataset: (jobId: string) =>
    API_URL() + `jobs/${jobId}/get_generated_dataset`,
  GetPlotJSON: (jobId: string) => API_URL() + `jobs/${jobId}/get_figure_json`,
};

Endpoints.Jobs = {
  List: () => API_URL() + 'jobs/list',
  Get: (jobId: string) => API_URL() + 'train/job/' + jobId,
  Create: (
    experimentId?: string,
    type?: string,
    status?: string,
    data?: string, //Should be JSON
  ) =>
    API_URL() +
    'jobs/create' +
    '?status=' +
    (status ? status : 'CREATED') +
    (experimentId ? '&experiment_id=' + experimentId : '') +
    (type ? '&type=' + type : '') +
    (data ? '&data=' + data : ''),
  GetJobsOfType: (type: string = '', status: string = '') =>
    API_URL() + 'jobs/list' + '?type=' + type + '&status=' + status,
  Delete: (jobId: string) => API_URL() + 'jobs/delete/' + jobId,
  GetTrainingTemplate: (template_id: string) =>
    API_URL() + 'jobs/template/' + template_id,
  UpdateTrainingTemplate: (
    template_id: string,
    name: string,
    description: string,
    type: string,
    config: Object,
  ) =>
    API_URL() +
    'jobs/template/update' +
    '?template_id=' +
    template_id +
    '&name=' +
    name +
    '&description=' +
    description +
    '&type=' +
    type +
    '&config=' +
    config,
  Stop: (jobId: string) => API_URL() + 'jobs/' + jobId + '/stop',
};

Endpoints.Global = {
  PromptLog: () => API_URL() + 'prompt_log',
};

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

  const response = await fetch(API_URL() + 'experiment/' + id + '/evals/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(newPlugin),
  });
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

  const response = await fetch(API_URL() + 'experiment/' + id + '/evals/edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(newPlugin),
  });
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

  const response = await fetch(
    API_URL() + 'experiment/' + id + '/generations/add',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

  const response = await fetch(
    API_URL() + 'experiment/' + id + '/generations/edit',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
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

export function activateTransformerLabAPI(): void {
  window.electron.ipcRenderer.sendMessage('spawn-start-transformerlab-api');
}

export async function startFinetune(
  modelName: string,
  adaptorName: string,
  trainingData: string,
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
  config: string,
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
    },
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

const fetcher = (...args: any[]) =>
  fetch(...args).then((res) => {
    if (!res.ok) {
      const error = new Error('An error occurred fetching ' + res.url);
      error.response = res.json();
      error.status = res.status;
      console.log(res);
      throw error;
    }
    return res.json();
  });

export function useModelStatus() {
  const api_url = API_URL();
  const url = api_url ? api_url + 'server/worker_healthz' : null;

  // Poll every 2 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, error, isLoading, mutate } = useSWR(url, fetcher, options);

  if (error || data?.length === 0) {
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
  const { data, isLoading, mutate } = useSWR(
    experimentInfo
      ? Endpoints.Experiment.ListScripts(experimentInfo?.id)
      : null,
    fetcher,
  );

  let outdatedPlugins = [];
  if (data) {
    outdatedPlugins = data.filter(
      (plugin: any) =>
        plugin?.gallery_version && plugin?.version != plugin?.gallery_version,
    );
  }

  return { data: outdatedPlugins, isLoading, mutate };
}

export function useServerStats() {
  const api_url = API_URL();
  const url = api_url ? API_URL() + 'server/info' : null;

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
    API_URL() + 'plugins/download?plugin_slug=' + pluginId,
  );
  const result = await response.json();
  return result;
}

const fetchAndGetErrorStatus = async (url) => {
  console.log('🛎️fetching', url);

  const res = await fetch(url);

  // console.log('🛎️fetched', res);

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
};

/**
 * Check your localhost to see if the server is active
 */
export function useCheckLocalConnection() {
  const url = 'http://localhost:8338/' + 'server/info';

  // Poll every 2 seconds
  const options = {
    refreshInterval: 500,
    refreshWhenOffline: true,
    refreshWhenHidden: true,
    shouldRetryOnError: true,
    errorRetryInterval: 500,
    errorRetryCount: 1000,
  };

  // eslint-disable-next-line prefer-const
  let { data, error, mutate } = useSWR(url, fetchAndGetErrorStatus, options);

  return {
    server: data,
    error: error,
    mutate: mutate,
  };
}

export {
  stopStreamingResponse,
  sendAndReceive,
  sendAndReceiveStreaming,
  sendCompletion,
  sendCompletionReactWay,
  sendBatchedCompletion,
  sendBatchedChat,
  callTool,
  getEmbeddings,
  tokenize,
  generateLogProbs,
  countTokens,
  countChatTokens,
} from './api-client/chat';

export { INFERENCE_SERVER_URL, API_URL };
