/* eslint-disable camelcase */
/* eslint-disable prefer-template */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */

import { API_URL, INFERENCE_SERVER_URL, FULL_PATH } from './api-client/urls';
import { Endpoints } from './api-client/endpoints';

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
} from './api-client/functions';

export {
  useModelStatus,
  usePluginStatus,
  useServerStats,
  useCheckLocalConnection,
} from './api-client/hooks';

export { INFERENCE_SERVER_URL, API_URL };

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
