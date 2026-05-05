/* eslint-disable camelcase */
import { API_URL, FULL_PATH } from './urls';

export const Endpoints: any = {};

// We do this because the API does not like slashes in the URL
function convertSlashInUrl(url: string) {
  return url.replace(/\//g, '~~~');
}

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
  CreateTemplate: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/create`,
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
  TeamGalleryListFiles: (experimentId: string, galleryId: string) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/team/${encodeURIComponent(
      galleryId,
    )}/files`,
  TeamGalleryGetFile: (
    experimentId: string,
    galleryId: string,
    filePath: string,
  ) =>
    `${API_URL()}experiment/${experimentId}/task/gallery/team/${encodeURIComponent(
      galleryId,
    )}/file/${encodeURIComponent(filePath)}`,
  FetchTaskJson: (experimentId: string, url: string) =>
    `${API_URL()}experiment/${experimentId}/task/fetch_task_json?url=${encodeURIComponent(url)}`,
  FromDirectory: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/create`,
  BlankFromYaml: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/create`,
  GetYaml: (experimentId: string, taskId: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/yaml`,
  UpdateYaml: (experimentId: string, taskId: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/yaml`,
  ValidateYaml: (experimentId: string) =>
    `${API_URL()}experiment/${experimentId}/task/validate`,
  ListFiles: (experimentId: string, taskId: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/files`,
  GetFile: (experimentId: string, taskId: string, filePath: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/file/${encodeURIComponent(
      filePath,
    )}`,
  UpdateFile: (experimentId: string, taskId: string, filePath: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/file/${encodeURIComponent(
      filePath,
    )}`,
  DeleteFile: (experimentId: string, taskId: string, filePath: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/file/${encodeURIComponent(
      filePath,
    )}`,
  UploadFile: (experimentId: string, taskId: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/file-upload`,
  GetGithubFile: (experimentId: string, taskId: string, filePath: string) =>
    `${API_URL()}experiment/${experimentId}/task/${taskId}/github_file/${encodeURIComponent(
      filePath,
    )}`,
};

Endpoints.ComputeProvider = {
  List: () => `${API_URL()}compute_provider/providers/`,
  LaunchTemplate: (providerId: string) =>
    `${API_URL()}compute_provider/providers/${providerId}/launch/`,
  LaunchTask: (providerId: string) =>
    `${API_URL()}compute_provider/providers/${providerId}/launch/`, // Deprecated: use LaunchTemplate
  CheckJobStatus: (jobId: string, experimentId: string) => {
    const baseUrl = `${API_URL()}compute_provider/jobs/${jobId}/check-status`;
    return `${baseUrl}?experiment_id=${encodeURIComponent(String(experimentId))}`;
  },
  CheckSweepStatus: (experimentId?: string, jobId?: string) => {
    if (experimentId) {
      return `${API_URL()}compute_provider/sweep/?experiment_id=${experimentId}`;
    }
    if (jobId) {
      return `${API_URL()}compute_provider/sweep/${jobId}/status`;
    }
    throw new Error('Either experimentId or jobId must be provided');
  },
  GetSweepResults: (jobId: string) =>
    `${API_URL()}compute_provider/sweep/${jobId}/results`,
  StopCluster: (
    providerId: string,
    clusterName: string,
    jobId?: string | number,
  ) => {
    const base = `${API_URL()}compute_provider/providers/${providerId}/clusters/${clusterName}/stop`;
    if (jobId === undefined || jobId === null) {
      return base;
    }
    return `${base}?job_id=${encodeURIComponent(String(jobId))}`;
  },
  UploadTemplateFile: (providerId: string, taskId: string | number) =>
    `${API_URL()}compute_provider/providers/${providerId}/launch/${taskId}/file-upload`,
  UploadTaskFile: (providerId: string, taskId: string | number) =>
    `${API_URL()}compute_provider/providers/${providerId}/launch/${taskId}/file-upload`, // Deprecated: use UploadTemplateFile
  Check: (providerId: string) =>
    `${API_URL()}compute_provider/providers/${providerId}/check`,
  AwsCredentials: (providerId: string) =>
    `${API_URL()}compute_provider/providers/${providerId}/aws/credentials`,
  Setup: (providerId: string) =>
    `${API_URL()}compute_provider/providers/${providerId}/setup/`,
  SetupStatus: (providerId: string) =>
    `${API_URL()}compute_provider/providers/${providerId}/setup/status`,
  DetectLocalAccelerators: () =>
    `${API_URL()}compute_provider/providers/detect-accelerators`,
  EnsureQuotaRecorded: (experimentId?: string, jobId?: string) => {
    if (jobId) {
      return `${API_URL()}compute_provider/jobs/ensure-quota-recorded?job_id=${jobId}`;
    }
    if (experimentId) {
      return `${API_URL()}compute_provider/jobs/ensure-quota-recorded?experiment_id=${experimentId}`;
    }
    return `${API_URL()}compute_provider/jobs/ensure-quota-recorded`;
  },
  LaunchStorageProbe: (providerId: string) =>
    `${API_URL()}compute_provider/providers/${providerId}/debug/storage-probe`,
  CheckStorageProbe: (providerId: string, jobId: string) =>
    `${API_URL()}compute_provider/providers/${providerId}/debug/storage-probe/${jobId}`,
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
  RegistryVersionList: () => `${API_URL()}model/registry_versions`,
  ModelGroups: () => `${API_URL()}model/model_groups_list`,
  GetPeftsForModel: () => `${API_URL()}model/pefts`,
  DeletePeft: (modelId: string, peft: string) =>
    `${API_URL()}model/delete_peft?model_id=${modelId}&peft=${peft}`,
  InstallPeft: (modelId: string, peft: string) =>
    `${API_URL()}model/install_peft?model_id=${modelId}&peft=${peft}`,
  ModelDetailsFromGallery: (modelId: string) =>
    `${API_URL()}model/gallery/${convertSlashInUrl(modelId)}`,
  Delete: (modelId: string, deleteCache: boolean = false) =>
    `${API_URL()}model/delete?model_id=${modelId}&delete_from_cache=${
      deleteCache
    }`,
};

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
};

Endpoints.ServerInfo = {
  StreamLog: () => `${API_URL()}server/stream_log`,
  Version: () => `${API_URL()}server/version`,
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
  GetRequestLogs: (
    experimentId: string,
    jobId: string,
    tailLines: number = 400,
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/request_logs?tail_lines=${tailLines}`,
  GetTunnelInfo: (
    experimentId: string,
    jobId: string,
    tailLines: number = 1000,
  ) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/tunnel_info?tail_lines=${tailLines}`,
  GetProfilingReport: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/profiling_report`,
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
  GetSweepResults: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/sweep_results`,
  GetGeneratedDataset: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/get_generated_dataset`,
  GetPlotJSON: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/get_figure_json`,
  GetNotes: (id: string) => `${API_URL()}experiment/${id}/notes`,
  SaveNotes: (id: string) => `${API_URL()}experiment/${id}/notes`,
  UploadNoteAsset: (id: string) => `${API_URL()}experiment/${id}/notes/assets`,
  GetNoteAsset: (id: string, filename: string) =>
    `${API_URL()}experiment/${id}/notes/assets/${filename}`,
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
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}`,
  Stop: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/stop`,
  Update: (experimentId: string, jobId: string, status: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/update/${jobId}?status=${status}`,
  GetEvalImages: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/get_eval_images`,
  UpdateJobData: (experimentId: string, jobId: string) =>
    `${API_URL()}experiment/${experimentId}/jobs/${jobId}/job_data`,
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

Endpoints.Upload = {
  Init: () => `${API_URL()}upload/init`,
  Chunk: (uploadId: string) => `${API_URL()}upload/${uploadId}/chunk`,
  Status: (uploadId: string) => `${API_URL()}upload/${uploadId}/status`,
  Complete: (uploadId: string) => `${API_URL()}upload/${uploadId}/complete`,
  Delete: (uploadId: string) => `${API_URL()}upload/${uploadId}`,
};

Endpoints.AssetVersions = {
  ListGroups: (assetType: string) =>
    `${API_URL()}asset_versions/groups?asset_type=${assetType}`,
  DeleteGroup: (assetType: string, groupId: string) =>
    `${API_URL()}asset_versions/groups/${assetType}/${groupId}`,
  UpdateGroup: (assetType: string, groupId: string) =>
    `${API_URL()}asset_versions/groups/${assetType}/${groupId}`,
  CreateVersion: () => `${API_URL()}asset_versions/versions`,
  ListVersions: (assetType: string, groupId: string) =>
    `${API_URL()}asset_versions/versions/${assetType}/${groupId}`,
  GetVersion: (assetType: string, groupId: string, versionLabel: string) =>
    `${API_URL()}asset_versions/versions/${assetType}/${groupId}/${versionLabel}`,
  DeleteVersion: (assetType: string, groupId: string, versionLabel: string) =>
    `${API_URL()}asset_versions/versions/${assetType}/${groupId}/${versionLabel}`,
  UpdateVersion: (assetType: string, groupId: string, versionLabel: string) =>
    `${API_URL()}asset_versions/versions/${assetType}/${groupId}/${versionLabel}`,
  SetTag: (assetType: string, groupId: string, versionLabel: string) =>
    `${API_URL()}asset_versions/versions/${assetType}/${groupId}/${versionLabel}/tag`,
  ClearTag: (assetType: string, groupId: string, versionLabel: string) =>
    `${API_URL()}asset_versions/versions/${assetType}/${groupId}/${versionLabel}/tag`,
  Resolve: (
    assetType: string,
    groupId: string,
    tag?: string,
    versionLabel?: string,
  ) => {
    let url = `${API_URL()}asset_versions/resolve/${assetType}/${groupId}`;
    const params: string[] = [];
    if (tag) params.push(`tag=${tag}`);
    if (versionLabel !== undefined)
      params.push(`version_label=${versionLabel}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return url;
  },
  GetAssetGroupMap: (assetType: string) =>
    `${API_URL()}asset_versions/map/${assetType}`,
};
