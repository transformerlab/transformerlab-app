/* eslint-disable camelcase */
/* eslint-disable prefer-template */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */

import { Endpoints } from './api-client/endpoints';

export * from './api-client/endpoints';

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

export {
  downloadModelFromHuggingFace,
  downloadModelFromGallery,
  activeModels,
  apiHealthz,
  controllerHealthz,
  localaiHealthz,
  getComputerInfo,
  activateWorker,
  killWorker,
  GET_EXPERIMENT_UPDATE_CONFIG_URL,
  EXPERIMENT_ADD_EVALUATION,
  EXPERIMENT_EDIT_EVALUATION,
  EXPERIMENT_ADD_GENERATION,
  EXPERIMENT_EDIT_GENERATION,
  TEMPLATE_FOR_MODEL_URL,
  getTemplateForModel,
} from './api-client/functions';

export {
  useAPI,
  useModelStatus,
  usePluginStatus,
  useServerStats,
  useCheckLocalConnection,
} from './api-client/hooks';

export { INFERENCE_SERVER_URL, API_URL, getFullPath } from './api-client/urls';

export async function listWorkflowTriggers(experimentId: string) {
  const response = await fetch(Endpoints.WorkflowTriggers.ListByExperiment(experimentId));
  const result = await response.json();
  return result;
}

export async function getWorkflowTriggerDetails(triggerId: string) {
  const response = await fetch(Endpoints.WorkflowTriggers.GetDetails(triggerId));
  const result = await response.json();
  return result;
}

export async function updateWorkflowTrigger(triggerId: string, payload: { is_enabled: boolean, config: { workflow_ids: number[] } }) {
  const response = await fetch(Endpoints.WorkflowTriggers.Update(triggerId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  return result;
}

export async function listWorkflowsForExperiment(experimentId: string) {
  const response = await fetch(Endpoints.Workflows.ListInExperiment(experimentId));
  const result = await response.json();
  return result;
}

export async function getPredefinedTriggers() {
  const response = await fetch(Endpoints.Workflows.GetPredefinedTriggers());
  const result = await response.json();
  return result;
}

export async function getWorkflowDetails(workflowId: string) {
  const response = await fetch(Endpoints.Workflows.GetDetails(workflowId));
  const result = await response.json();
  return result;
}

export async function updateWorkflowTriggerConfigs(workflowId: string, configs: Array<{trigger_type: string, is_enabled: boolean}>) {
  const response = await fetch(Endpoints.Workflows.UpdateTriggerConfigs(workflowId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ configs }),
  });
  const result = await response.json();
  return result;
}
