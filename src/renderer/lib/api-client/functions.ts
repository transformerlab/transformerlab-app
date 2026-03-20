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
