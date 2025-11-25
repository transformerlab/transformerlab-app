/* eslint-disable camelcase */
/* eslint-disable prefer-template */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */

export * from './api-client/endpoints';

export {
  stopStreamingResponse,
  sendAndReceive,
  sendAndReceiveStreaming,
  sendCompletion,
  sendCompletionReactWay,
  sendBatchedCompletion,
  sendBatchedChat,
  sendBatchedAudio,
  callTool,
  getToolsForCompletions,
  getEmbeddings,
  tokenize,
  generateLogProbs,
  countTokens,
  countChatTokens,
} from './api-client/chat';

export {
  downloadModelFromHuggingFace,
  downloadGGUFFile,
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
  authenticatedFetch,
} from './api-client/functions';

export {
  useModelStatus,
  usePluginStatus,
  useServerStats,
  useCheckLocalConnection,
  fetcher,
} from './api-client/hooks';

export {
  INFERENCE_SERVER_URL,
  API_URL,
  getAPIFullPath,
} from './api-client/urls';

export { useAPI } from './authContext';
