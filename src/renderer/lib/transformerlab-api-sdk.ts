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
  callTool,
  getEmbeddings,
  tokenize,
  generateLogProbs,
  countTokens,
  countChatTokens,
} from './api-client/chat';

export {
  login,
  logout,
  getAccessToken,
  registerUser,
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
} from './api-client/functions';

export {
  useAPI,
  useModelStatus,
  usePluginStatus,
  useServerStats,
  useCheckLocalConnection,
} from './api-client/hooks';

export {
  INFERENCE_SERVER_URL,
  API_URL,
  getAPIFullPath,
} from './api-client/urls';
