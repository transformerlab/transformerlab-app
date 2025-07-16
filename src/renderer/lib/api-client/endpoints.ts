/* eslint-disable camelcase */
import { API_URL, FULL_PATH } from './urls';

export const Endpoints: any = {};

// We do this because the API does not like slashes in the URL
function convertSlashInUrl(url: string) {
  return url.replace(/\//g, '~~~');
}

Endpoints.Tasks = {
  List: () => `${API_URL()}tasks/list`,
  ListByType: (type: string) => `${API_URL()}tasks/list_by_type?type=${type}`,
  ListByTypeInExperiment: (type: string, experiment_id: string) =>
    `${API_URL()}tasks/list_by_type_in_experiment?type=${type}&experiment_id=${
      experiment_id
    }`,
  Queue: (id: string) => `${API_URL()}tasks/${id}/queue`,
  GetByID: (id: string) => `${API_URL()}tasks/${id}/get`,
  UpdateTask: (id: string) => `${API_URL()}tasks/${id}/update`,
  NewTask: () => `${API_URL()}tasks/new_task`,
  DeleteTask: (id: string) => `${API_URL()}tasks/${id}/delete`,
};

Endpoints.Workflows = {
  ListInExperiment: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/list`,
  CreateEmpty: (name: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/create_empty` +
    `?name=${name}`,
  UpdateName: (workflowId: string, new_name: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/update_name?new_name=${new_name}`,
  UpdateConfig: (workflowId: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/config`,
  DeleteWorkflow: (workflowId: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/delete/${workflowId}`,
  AddNode: (workflowId: string, node: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/add_node?node=${node}`,
  DeleteNode: (workflowId: string, nodeId: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/${nodeId}/delete_node`,
  UpdateNode: (
    workflowId: string,
    nodeId: string,
    node: string,
    experimentId: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/${nodeId}/update_node` +
    `?node=${node}`,
  EditNodeMetadata: (
    workflowId: string,
    nodeId: string,
    metadata: string,
    experimentId: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/${nodeId}/edit_node_metadata` +
    `?metadata=${metadata}`,
  AddEdge: (
    workflowId: string,
    from: string,
    to: string,
    experimentId: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/${from}/add_edge` +
    `?end_node_id=${to}`,
  RemoveEdge: (
    workflowId: string,
    start_node_id: string,
    to: string,
    experimentId: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/${start_node_id}/remove_edge` +
    `?end_node_id=${to}`,
  RunWorkflow: (workflowId: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/start`,
  ListRunsInExperiment: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/runs`,
  GetRun: (workflowRunID: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/runs/${workflowRunID}`,
  CancelRun: (workflowRunID: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowRunID}/cancel`,
  ExportToYAML: (workflowId: string, experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/${workflowId}/export_to_yaml`,
  ImportFromYAML: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/import_from_yaml`,
  StartNextStep: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/workflows/start_next_step`,
};

Endpoints.Dataset = {
  Gallery: () => `${API_URL()}data/gallery`,
  Info: (datasetId: string) => `${API_URL()}data/info?dataset_id=${datasetId}`,
  Preview: (
    datasetId: string,
    split: string = '',
    offset: number = 0,
    limit: number = 10,
  ) =>
    `${API_URL()}data/preview?dataset_id=${datasetId}&split=${split}&offset=${
      offset
    }&limit=${limit}`,
  PreviewWithTemplate: (
    datasetId: string,
    template: string,
    offset: number,
    limit: number,
  ) =>
    `${API_URL()}data/preview_with_template?dataset_id=${datasetId}&template=${
      template
    }&offset=${offset}&limit=${limit}`,
  Delete: (datasetId: string) =>
    `${API_URL()}data/delete?dataset_id=${datasetId}`,
  Create: (datasetId: string) => `${API_URL()}data/new?dataset_id=${datasetId}`,
  Download: (datasetId: string, configName?: string) =>
    `${API_URL()}data/download?dataset_id=${
      datasetId
    }${configName ? `&config_name=${configName}` : ''}`,
  LocalList: (generated: boolean = true) =>
    `${API_URL()}data/list?generated=${generated}`,
  GeneratedList: () => `${API_URL()}data/generated_datasets_list`,
  FileUpload: (datasetId: string) =>
    `${API_URL()}data/fileupload?dataset_id=${datasetId}`,
};

Endpoints.Models = {
  LocalList: () => `${API_URL()}model/list`,
  CountDownloaded: () => `${API_URL()}model/count_downloaded`,
  Gallery: () => `${API_URL()}model/gallery`,
  ModelGroups: () => `${API_URL()}model/model_groups_list`,
  GetPeftsForModel: () => `${API_URL()}model/pefts`,
  UploadModelToHuggingFace: (
    modelId: string,
    modelName: string,
    organizationName?: string,
    model_card_data?: object,
  ) =>
    `${API_URL()}model/upload_to_huggingface?model_id=${modelId}&model_name=${
      modelName
    }&organization_name=${organizationName}&model_card_data=${JSON.stringify(
      model_card_data,
    )}`,
  DeletePeft: (modelId: string, peft: string) =>
    `${API_URL()}model/delete_peft?model_id=${modelId}&peft=${peft}`,
  InstallPeft: (modelId: string, peft: string) =>
    `${API_URL()}model/install_peft?model_id=${modelId}&peft=${peft}`,
  ModelDetailsFromGallery: (modelId: string) =>
    `${API_URL()}model/gallery/${convertSlashInUrl(modelId)}`,
  ModelDetailsFromFilesystem: (modelId: string) =>
    `${API_URL()}model/details/${convertSlashInUrl(modelId)}`,
  ModelProvenance: (modelId: string) =>
    `${API_URL()}model/provenance/${convertSlashInUrl(modelId)}`,
  GetLocalHFConfig: (modelId: string) =>
    `${API_URL()}model/get_local_hfconfig?model_id=${modelId}`,
  SearchForLocalUninstalledModels: (path: string) =>
    `${API_URL()}model/list_local_uninstalled?path=${path}`,
  ImportFromSource: (modelSource: string, modelId: string) =>
    `${API_URL()}model/import_from_source?model_source=${
      modelSource
    }&model_id=${modelId}`,

  ImportFromLocalPath: (modelPath: string) =>
    `${API_URL()}model/import_from_local_path?model_path=${modelPath}`,
  HuggingFaceLogin: () => `${API_URL()}model/login_to_huggingface`,
  Delete: (modelId: string, deleteCache: boolean = false) =>
    `${API_URL()}model/delete?model_id=${modelId}&delete_from_cache=${
      deleteCache
    }`,
  wandbLogin: () => `${API_URL()}model/login_to_wandb`,
  testWandbLogin: () => `${API_URL()}model/test_wandb_login`,
};

Endpoints.Plugins = {
  Gallery: () => `${API_URL()}plugins/gallery`,
  Info: (pluginId: string) => `${API_URL()}plugins/info?plugin_id=${pluginId}`,
  Preview: (pluginId: string) =>
    `${API_URL()}plugins/preview?pluginId=${pluginId}`,
  List: () => `${API_URL()}plugins/list`,
  RunPluginInstallScript: (pluginId: string) =>
    `${API_URL()}plugins/${pluginId}/run_installer_script`,
};

// Following is no longer needed as it is replaced with useAPI
// Endpoints.Config = {
//   Get: (key: string) => `${API_URL()}config/get/${key}`,
//   Set: (key: string, value: string) =>
//     `${API_URL()}config/set?k=${key}&v=${value}`,
// };

Endpoints.Documents = {
  List: (experimentId: string, currentFolder: string = '') =>
    `${API_URL()}experiment/${experimentId}/documents/list?folder=${
      currentFolder
    }`,
  Open: (experimentId: string, document_name: string, folder: string) =>
    `${API_URL()}experiment/${experimentId}/documents/open/${
      document_name
    }?folder=${folder}`,
  Upload: (experimentId: string, currentFolder: string = '') =>
    `${API_URL()}experiment/${experimentId}/documents/upload?folder=${
      currentFolder
    }`,
  Delete: (experimentId: string, document_name: string, folder: string) =>
    `${API_URL()}experiment/${experimentId}/documents/delete?document_name=${
      document_name
    }&folder=${folder}`,
  CreateFolder: (experimentId: string, folderName: string) =>
    `${API_URL()}experiment/${experimentId}/documents/create_folder?name=${
      folderName
    }`,
  UploadLinks: (experimentId: string, folderName: string) =>
    `${API_URL()}experiment/${experimentId}/documents/upload_links?folder=${
      folderName
    }`,
};

Endpoints.Rag = {
  Query: (
    experimentId: string,
    model_name: string,
    query: string,
    settings: string,
    ragFolder: string = 'rag',
  ) =>
    `${API_URL()}experiment/${experimentId}/rag/query?model=${model_name}&query=${query}&settings=${settings}&rag_folder=${ragFolder}`,
  ReIndex: (experimentId: string, folderName: string = 'rag') =>
    `${API_URL()}experiment/${experimentId}/rag/reindex?rag_folder=${folderName}`,
  Embeddings: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/rag/embed`,
};

Endpoints.Prompts = {
  List: () => `${API_URL()}prompts/list`,
  New: () => `${API_URL()}prompts/new`,
  Delete: (promptId: string) => `${API_URL()}prompts/delete/${promptId}`,
};

Endpoints.BatchedPrompts = {
  List: () => `${API_URL()}batch/list`,
  New: () => `${API_URL()}batch/new`,
  Delete: (promptId: string) => `${API_URL()}batch/delete/${promptId}`,
  InstallMcpPlugin: (serverName: string) =>
    `${API_URL()}tools/install_mcp_server?server_name=${encodeURIComponent(serverName)}`,
};

Endpoints.Tools = {
  Call: (function_name: string, function_arguments: string) =>
    `${API_URL()}tools/call/${function_name}?params=${function_arguments}`,
  Prompt: () => `${API_URL()}tools/prompt`,
  List: () => `${API_URL()}tools/list`,
  InstallMcpPlugin: (serverName: string) =>
    `${API_URL()}tools/install_mcp_server?server_name=${encodeURIComponent(serverName)}`,
};

Endpoints.ServerInfo = {
  Get: () => `${API_URL()}server/info`,
  PythonLibraries: () => `${API_URL()}server/python_libraries`,
  StreamLog: () => `${API_URL()}server/stream_log`,
};

Endpoints.Charts = {
  CompareEvals: (jobIds: string) =>
    `${API_URL()}evals/compare_evals?job_list=${jobIds}`,
};

export function GET_TRAINING_TEMPLATE_URL() {
  return `${API_URL()}train/templates`;
}

export function CREATE_TRAINING_JOB_URL(
  template_id: string,
  experiment_id: string,
) {
  return `${API_URL()}train/job/create?template_id=${
    template_id
  }&description=description&experiment_id=${experiment_id}`;
}

Endpoints.Experiment = {
  GetAll: () => `${API_URL()}experiment/`,
  UpdateConfig: (id: string, key: string, value: string) =>
    `${API_URL()}experiment/${id}/update_config` +
    `?key=${key}&value=${encodeURIComponent(value)}`,
  UpdateConfigs: (id: string) => `${API_URL()}experiment/${id}/update_configs`,
  Create: (name: string) => `${API_URL()}experiment/create?name=${name}`,
  Get: (id: string) => `${API_URL()}experiment/${id}`,
  Delete: (id: string) => `${API_URL()}experiment/${id}/delete`,
  SavePrompt: (id: string) => `${API_URL()}experiment/${id}/prompt`,
  GetFile: (id: string, filename: string) =>
    `${API_URL()}experiment/${id}/file_contents?filename=${filename}`,
  SaveFile: (id: string, filename: string) =>
    `${API_URL()}experiment/${id}/save_file_contents?filename=${filename}`,
  GetPlugin: (id: string, plugin_name: string) => {
    return `${API_URL()}experiment/${
      id
    }/evals/get_evaluation_plugin_file_contents?plugin_name=${plugin_name}`;
  },
  GetGenerationPlugin: (id: string, plugin_name: string) => {
    return `${API_URL()}experiment/${
      id
    }/generations/get_evaluation_plugin_file_contents?plugin_name=${
      plugin_name
    }`;
  },
  RunEvaluation: (id: string, pluginName: string, evalName: string) => {
    return `${API_URL()}experiment/${
      id
    }/evals/run_evaluation_script?eval_name=${evalName}&plugin_name=${
      pluginName
    }`;
  },
  RunGeneration: (id: string, pluginName: string, evalName: string) => {
    return `${API_URL()}experiment/${
      id
    }/generations/run_generation_script?generation_name=${
      evalName
    }&plugin_name=${pluginName}`;
  },
  DeleteEval: (experimentId: string, evalName: string) =>
    `${API_URL()}experiment/${experimentId}/evals/delete` +
    `?eval_name=${evalName}`,
  DeleteGeneration: (experimentId: string, evalName: string) =>
    `${API_URL()}experiment/${experimentId}/generations/delete` +
    `?generation_name=${evalName}`,
  GetEvalOutput: (experimentId: string, eval_name: string) =>
    `${API_URL()}experiment/${experimentId}/evals/get_output` +
    `?eval_name=${eval_name}`,
  GetGenerationOutput: (experimentId: string, eval_name: string) =>
    `${API_URL()}experiment/${experimentId}/generations/get_output` +
    `?eval_name=${eval_name}`,
  RunExport: (
    id: string,
    pluginName: string,
    pluginArchitecture: string,
    pluginParams: string,
  ) => {
    return `${API_URL()}experiment/${
      id
    }/export/run_exporter_script?plugin_name=${
      pluginName
    }&plugin_architecture=${pluginArchitecture}&plugin_params=${pluginParams}`;
  },
  SaveConversation: (experimentId: String) =>
    `${API_URL()}experiment/${experimentId}/conversations/save`,
  GetConversations: (experimentId: string) =>
    FULL_PATH(`experiment/${experimentId}/conversations/list`),
  DeleteConversation: (experimentId: string, conversationId: string) =>
    FULL_PATH(
      `experiment/${experimentId}/conversations/delete?conversation_id=${
        conversationId
      }`,
    ),
  InstallPlugin: (experimentId: string, pluginId: string) =>
    `${API_URL()}experiment/${
      experimentId
    }/plugins/install_plugin_to_experiment?plugin_name=${pluginId}`,
  DeletePlugin: (experimentId: string, pluginId: string) =>
    `${API_URL()}experiment/${
      experimentId
    }/plugins/delete_plugin_from_experiment?plugin_name=${pluginId}`,
  ListScripts: (experimentId: string) =>
    FULL_PATH(`experiment/${experimentId}/plugins/list`),
  ListScriptsOfType: (
    experimentId: string,
    type: string,
    filter: string | null = null,
  ) =>
    FULL_PATH(
      `experiment/${experimentId}/plugins/list?type=${
        type
      }${filter ? `&filter=${filter}` : ''}`,
    ),
  ScriptListFiles: (experimentId: string, id: string) =>
    `${API_URL()}experiment/${experimentId}/plugins/${id}/list_files`,
  ScriptGetFile: (experimentId: string, pluginId: string, filename: string) =>
    `${API_URL()}experiment/${experimentId}/plugins/${
      pluginId
    }/file_contents?filename=${filename}`,
  ScriptNewFile: (experimentId: string, pluginId: string, filename: string) =>
    `${API_URL()}experiment/${experimentId}/plugins/${
      pluginId
    }/create_new_file?filename=${filename}`,
  ScriptDeleteFile: (
    experimentId: string,
    pluginId: string,
    filename: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/plugins/${
      pluginId
    }/delete_file?filename=${filename}`,
  ScriptSaveFile: (experimentId: string, pluginId: string, filename: string) =>
    `${API_URL()}experiment/${experimentId}/plugins/${
      pluginId
    }/save_file_contents?filename=${filename}`,
  ScriptCreateNew: (experimentId: string, pluginId: string) =>
    `${API_URL()}experiment/${experimentId}/plugins/new_plugin?pluginId=${
      pluginId
    }`,
  ScriptDeletePlugin: (experimentId: string, pluginId: string) =>
    `${API_URL()}experiment/${experimentId}plugins/delete_plugin?pluginId=${
      pluginId
    }`,
  GetOutputFromJob: (jobId: string) => `${API_URL()}train/job/${jobId}/output`,
  StreamOutputFromJob: (jobId: string, sweep: boolean = false) =>
    `${API_URL()}jobs/${jobId}/stream_output?sweeps=${sweep}`,
  StreamDetailedJSONReportFromJob: (jobId: string, fileName: string) =>
    `${API_URL()}jobs/${jobId}/stream_detailed_json_report?file_name=${fileName}`,
  GetAdditionalDetails: (jobId: string, task: string = 'view') =>
    `${API_URL()}jobs/${jobId}/get_additional_details?task=${task}`,
  GetGeneratedDataset: (jobId: string) =>
    `${API_URL()}jobs/${jobId}/get_generated_dataset`,
  GetPlotJSON: (jobId: string) => `${API_URL()}jobs/${jobId}/get_figure_json`,
};

Endpoints.Jobs = {
  List: () => `${API_URL()}jobs/list`,
  Get: (jobId: string) => `${API_URL()}train/job/${jobId}`,
  Create: (
    experimentId?: string,
    type?: string,
    status?: string,
    data?: string, // Should be JSON
  ) =>
    `${API_URL()}jobs/create` +
    `?status=${status || 'CREATED'}${
      experimentId ? `&experiment_id=${experimentId}` : ''
    }${type ? `&type=${type}` : ''}${data ? `&data=${data}` : ''}`,
  GetJobsOfType: (type: string = '', status: string = '') =>
    `${API_URL()}jobs/list?type=${type}&status=${status}`,
  Delete: (jobId: string) => `${API_URL()}jobs/delete/${jobId}`,
  GetTrainingTemplate: (template_id: string) =>
    `${API_URL()}jobs/template/${template_id}`,
  UpdateTrainingTemplate: (
    template_id: string,
    name: string,
    description: string,
    type: string,
    config: Object,
  ) =>
    `${API_URL()}jobs/template/update` +
    `?template_id=${template_id}&name=${name}&description=${description}&type=${
      type
    }&config=${config}`,
  Stop: (jobId: string) => `${API_URL()}jobs/${jobId}/stop`,
  GetEvalImages: (jobId: string) => `${API_URL()}jobs/${jobId}/get_eval_images`,
  GetEvalImage: (jobId: string, filename: string) =>
    `${API_URL()}jobs/${jobId}/image/${filename}`,
};

Endpoints.Global = {
  PromptLog: () => `${API_URL()}prompt_log`,
};
