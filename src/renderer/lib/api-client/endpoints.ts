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
  ListBySubtypeInExperiment: (
    experiment_id: string,
    subtype: string,
    remote_task?: boolean,
  ) =>
    `${API_URL()}tasks/list_by_subtype_in_experiment?experiment_id=${experiment_id}&subtype=${encodeURIComponent(
      subtype,
    )}${remote_task !== undefined ? `&remote_task=${remote_task}` : ''}`,
  Queue: (id: string) => `${API_URL()}tasks/${id}/queue`,
  GetByID: (id: string) => `${API_URL()}tasks/${id}/get`,
  UpdateTask: (id: string) => `${API_URL()}tasks/${id}/update`,
  NewTask: () => `${API_URL()}tasks/new_task`,
  DeleteTask: (id: string) => `${API_URL()}tasks/${id}/delete`,
  Gallery: () => `${API_URL()}tasks/gallery`,
  ImportFromGallery: (experimentId: string) =>
    `${API_URL()}tasks/gallery/import`,
  TeamGallery: () => `${API_URL()}tasks/gallery/team`,
  ImportFromTeamGallery: (experimentId: string) =>
    `${API_URL()}tasks/gallery/team/import`,
  ExportToTeamGallery: () => `${API_URL()}tasks/gallery/team/export`,
  AddToTeamGallery: () => `${API_URL()}tasks/gallery/team/add`,
  DeleteFromTeamGallery: () => `${API_URL()}tasks/gallery/team/delete`,
};

Endpoints.Task = {
  List: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/list`,
  ListByType: (experimentId: string, type: string) =>
    `${API_URL()}experiment/${experimentId}/task/list_by_type?type=${type}`,
  ListByTypeInExperiment: (experimentId: string, type: string) =>
    `${API_URL()}experiment/${experimentId}/task/list_by_type_in_experiment?type=${type}`,
  ListBySubtypeInExperiment: (
    experimentId: string,
    subtype: string,
    type?: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/task/list_by_subtype_in_experiment?subtype=${encodeURIComponent(
      subtype,
    )}${type ? `&type=${encodeURIComponent(type)}` : ''}`,
  GetByID: (experimentId: string, id: string) =>
    `${API_URL()}experiment/${experimentId}/task/${id}/get`,
  UpdateTemplate: (experimentId: string, id: string) =>
    `${API_URL()}experiment/${experimentId}/task/${id}/update`,
  NewTemplate: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/new_task`,
  DeleteTemplate: (experimentId: string, id: string) =>
    `${API_URL()}experiment/${experimentId}/task/${id}/delete`,
  Gallery: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery`,
  InteractiveGallery: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/interactive`,
  ImportFromGallery: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/import`,
  TeamGallery: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/team`,
  ImportFromTeamGallery: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/team/import`,
  ExportToTeamGallery: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/team/export`,
  AddToTeamGallery: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/team/add`,
  DeleteFromTeamGallery: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/team/delete`,
  FetchTaskJson: (experimentId: string, url: string) =>
    `${API_URL()}experiment/${experimentId}/task/fetch_task_json?url=${encodeURIComponent(url)}`,
  FromDirectory: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task2/from_directory`,
  BlankFromYaml: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task2/blank`,
  GetYaml: (experimentId: string, taskId: string) =>
    `${API_URL()}experiment/${experimentId}/task2/${taskId}/yaml`,
  UpdateYaml: (experimentId: string, taskId: string) =>
    `${API_URL()}experiment/${experimentId}/task2/${taskId}/yaml`,
  ValidateYaml: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task2/validate`,
  ListFiles: (experimentId: string, taskId: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/files`,
  GetFile: (experimentId: string, taskId: string, filePath: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/file/${encodeURIComponent(
      filePath,
    )}`,
  GetGithubFile: (experimentId: string, taskId: string, filePath: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/github_file/${encodeURIComponent(
      filePath,
    )}`,
};

Endpoints.ComputeProvider = {
  List: () => `${API_URL()}compute_provider/`,
  LaunchTemplate: (providerId: string) =>
    `${API_URL()}compute_provider/${providerId}/task/launch`,
  LaunchTask: (providerId: string) =>
    `${API_URL()}compute_provider/${providerId}/task/launch`, // Deprecated: use LaunchTemplate
  CheckJobStatus: (jobId: string) =>
    `${API_URL()}compute_provider/jobs/${jobId}/check-status`,
  CheckSweepStatus: (experimentId?: string, jobId?: string) => {
    if (experimentId) {
      return `${API_URL()}compute_provider/jobs/sweep-status?experiment_id=${experimentId}`;
    }
    if (jobId) {
      return `${API_URL()}compute_provider/jobs/${jobId}/sweep-status`;
    }
    throw new Error('Either experimentId or jobId must be provided');
  },
  GetSweepResults: (jobId: string) =>
    `${API_URL()}compute_provider/jobs/${jobId}/sweep-results`,
  StopCluster: (providerId: string, clusterName: string) =>
    `${API_URL()}compute_provider/${providerId}/clusters/${clusterName}/stop`,
  UploadTemplateFile: (providerId: string, taskId: string | number) =>
    `${API_URL()}compute_provider/${providerId}/task/${taskId}/file-upload`,
  UploadTaskFile: (providerId: string, taskId: string | number) =>
    `${API_URL()}compute_provider/${providerId}/task/${taskId}/file-upload`, // Deprecated: use UploadTemplateFile
  Check: (providerId: string) =>
    `${API_URL()}compute_provider/${providerId}/check`,
  Setup: (providerId: string) =>
    `${API_URL()}compute_provider/${providerId}/setup`,
  SetupStatus: (providerId: string) =>
    `${API_URL()}compute_provider/${providerId}/setup/status`,
  EnsureQuotaRecorded: (experimentId?: string, jobId?: string) => {
    if (jobId) {
      return `${API_URL()}compute_provider/jobs/ensure-quota-recorded?job_id=${jobId}`;
    }
    if (experimentId) {
      return `${API_URL()}compute_provider/jobs/ensure-quota-recorded?experiment_id=${experimentId}`;
    }
    return `${API_URL()}compute_provider/jobs/ensure-quota-recorded`;
  },
};

Endpoints.SshKeys = {
  Get: () => `${API_URL()}ssh-key/`,
  Create: () => `${API_URL()}ssh-key/`,
  Update: () => `${API_URL()}ssh-key/`,
  Delete: () => `${API_URL()}ssh-key/`,
  Download: () => `${API_URL()}ssh-key/download`,
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
  Delete: (modelId: string, deleteCache: boolean = false) =>
    `${API_URL()}model/delete?model_id=${modelId}&delete_from_cache=${
      deleteCache
    }`,
};

Endpoints.Plugins = {
  Gallery: () => `${API_URL()}plugins/gallery`,
  Info: (pluginId: string) => `${API_URL()}plugins/info?plugin_id=${pluginId}`,
  Preview: (pluginId: string) =>
    `${API_URL()}plugins/preview?pluginId=${pluginId}`,
  List: () => `${API_URL()}plugins/list`,
  RunPluginInstallScript: (pluginId: string) =>
    `${API_URL()}plugins/${pluginId}/run_installer_script`,
  SuggestLoader: (modelArchitecture: string) =>
    `${API_URL()}plugins/suggest_loader?model_architecture=${encodeURIComponent(modelArchitecture)}`,
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
  List: () => `${API_URL()}tools/list`,
  All: () => `${API_URL()}tools/all`,
  InstallMcpPlugin: (serverName: string) =>
    `${API_URL()}tools/install_mcp_server?server_name=${encodeURIComponent(serverName)}`,
};

Endpoints.ServerInfo = {
  StreamLog: () => `${API_URL()}server/stream_log`,
};

Endpoints.Charts = {
  CompareEvals: (jobIds: string) =>
    `${API_URL()}evals/compare_evals?job_list=${jobIds}`,
};

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
  InstallPlugin: (pluginId: string) =>
    `${API_URL()}plugins/gallery/${pluginId}/install`,
  DeletePlugin: (pluginId: string) =>
    `${API_URL()}plugins/delete_plugin?plugin_name=${pluginId}`,
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
  GetOutputFromJob: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/output`,
  GetTasksOutputFromJob: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/tasks_output`,
  StreamOutputFromJob: (
    experimentId: string,
    jobId: string,
    sweep: boolean = false,
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/stream_output?sweeps=${sweep}`,
  StreamDetailedJSONReportFromJob: (
    experimentId: string,
    jobId: string,
    fileName: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/stream_detailed_json_report?file_name=${fileName}`,
  GetProviderLogs: (
    experimentId: string,
    jobId: string,
    tailLines: number = 400,
    live: boolean = false,
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/provider_logs?tail_lines=${tailLines}&live=${live}`,
  GetTunnelInfo: (
    experimentId: string,
    jobId: string,
    tailLines: number = 1000,
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/tunnel_info?tail_lines=${tailLines}`,
  GetAdditionalDetails: (
    experimentId: string,
    jobId: string,
    task: string = 'view',
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/get_additional_details?task=${task}`,
  GetEvalResults: (
    experimentId: string,
    jobId: string,
    task: string = 'view',
    fileIndex: number = 0,
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/get_eval_results?task=${task}&file_index=${fileIndex}`,
  GetGeneratedDataset: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/get_generated_dataset`,
  GetPlotJSON: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/get_figure_json`,
};

Endpoints.Jobs = {
  List: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/list`,
  ListWithFilters: (
    experimentId: string,
    type?: string,
    status?: string,
    subtype?: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/list` +
    `${type ? `?type=${type}` : ''}` +
    `${status ? `${type ? '&' : '?'}status=${status}` : ''}` +
    `${subtype ? `${type || status ? '&' : '?'}subtype=${encodeURIComponent(subtype)}` : ''}`,
  Get: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}`,
  Create: (
    experimentId: string,
    type?: string,
    status?: string,
    data?: string, // Should be JSON
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/create` +
    `?status=${status || 'CREATED'}` +
    `${type ? `&type=${type}` : ''}${data ? `&data=${data}` : ''}`,
  GetJobsOfType: (
    experimentId: string,
    type: string = '',
    status: string = '',
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/list?type=${type}&status=${status}`,
  Delete: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/delete/${jobId}`,
  Stop: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/stop`,
  Update: (experimentId: string, jobId: string, status: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/update/${jobId}?status=${status}`,
  GetEvalImages: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/get_eval_images`,
};

Endpoints.Global = {
  PromptLog: () => `${API_URL()}prompt_log`,
};

Endpoints.Quota = {
  GetMyStatus: () => `${API_URL()}quota/me`,
  GetMyUsage: () => `${API_URL()}quota/me/usage`,
  GetTeamQuota: (teamId: string) => `${API_URL()}quota/team/${teamId}`,
  UpdateTeamQuota: (teamId: string) => `${API_URL()}quota/team/${teamId}`,
  GetTeamUsers: (teamId: string) => `${API_URL()}quota/team/${teamId}/users`,
  UpdateUserOverride: (userId: string, teamId: string) =>
    `${API_URL()}quota/user/${userId}/team/${teamId}`,
};

Endpoints.Teams = {
  GetSecrets: (teamId: string) => `${API_URL()}teams/${teamId}/secrets`,
  SetSecrets: (teamId: string) => `${API_URL()}teams/${teamId}/secrets`,
};

Endpoints.Users = {
  GetSecrets: () => `${API_URL()}users/me/secrets`,
  SetSecrets: () => `${API_URL()}users/me/secrets`,
};
