/* eslint-disable camelcase */
/* eslint-disable prefer-template */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */

export * from './api-client/endpoints';

export {
<<<<<<< fix/remove-interactcomp-cache-compprov
=======
  stopStreamingResponse,
  sendAndReceiveStreaming,
  sendCompletion,
  sendCompletionReactWay,
  sendBatchedCompletion,
  sendBatchedChat,
  callTool,
  getToolsForCompletions,
  tokenize,
  countTokens,
  countChatTokens,
} from './api-client/chat';

export {
>>>>>>> main
  GET_EXPERIMENT_UPDATE_CONFIG_URL,
  EXPERIMENT_ADD_EVALUATION,
  TEMPLATE_FOR_MODEL_URL,
  getTemplateForModel,
  authenticatedFetch,
} from './api-client/functions';

export {
  useModelStatus,
  usePluginStatus,
  useConnectionHealth,
  fetcher,
} from './api-client/hooks';

export {
  INFERENCE_SERVER_URL,
  API_URL,
  getAPIFullPath,
} from './api-client/urls';

export { useAPI } from './authContext';
