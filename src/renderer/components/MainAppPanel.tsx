/* eslint-disable jsx-a11y/anchor-is-valid */

import {
  Routes,
  Route,
  useNavigate,
  redirect,
  useLocation,
} from 'react-router-dom';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import Data from './Data/Data';
import Interact from './Experiment/Interact/Interact';
import Embeddings from './Experiment/Embeddings';
import Welcome from './Welcome/Welcome';
import ModelZoo from './ModelZoo/ModelZoo';
import Plugins from './Plugins/Plugins';
import PluginDetails from './Plugins/PluginDetails';
import TaskLibrary from './TaskLibrary/TaskLibrary';

import Computer from './Computer';
import Eval from './Experiment/Eval/Eval';
import Generate from './Experiment/Generate/Generate';
import Export from './Experiment/Export/Export';
import Api from './Experiment/Api';
import Settings from './Experiment/Settings';
import TrainLoRA from './Experiment/Train/TrainLoRA';
import Prompt from './Experiment/Prompt';
import Documents from './Experiment/Documents';
import Rag from './Experiment/Rag';
import Tokenize from './Experiment/Interact/Tokenize';
import Diffusion from './Experiment/Diffusion/Diffusion';
import Audio from './Experiment/Audio/Audio';
import ExperimentNotes from './Experiment/ExperimentNotes';
import TransformerLabSettings from './Settings/TransformerLabSettings';
import Logs from './Logs';
import FoundationHome from './Experiment/Foundation';
import Workflows from './Experiment/Workflows';
import SelectEmbeddingModel from './Experiment/Foundation/SelectEmbeddingModel';
import { useAnalytics } from './Shared/analytics/AnalyticsContext';
import SafeJSONParse from './Shared/SafeJSONParse';
import Tasks from './Experiment/Tasks/Tasks';
import TaskLibrary from './TaskLibrary/TaskLibrary';

// // Define the app version
// const APP_VERSION = '1.0.0';

// PageTracker component to track page views
export const PageTracker = () => {
  const location = useLocation();
  const analytics = useAnalytics();

  useEffect(() => {
    const trackPageView = async () => {
      // Track page view when location changes
      analytics.page({
        path: location.pathname,
        url: window.location.href,
        search: location.search,
        title: document.title,
        context: {
          app: {
            version: window.platform?.version,
            mode: window.platform?.appmode,
          },
        },
      });
    };

    trackPageView();
  }, [location, analytics]);

  return null; // This component doesn't render anything
};

// This component renders the main content of the app that is shown
// On the rightmost side, regardless of what menu items are selected
// On the leftmost panel.
export default function MainAppPanel({
  setLogsDrawerOpen = null,
  gpuOrchestrationServer = '',
}) {
  const { experimentInfo, experimentInfoMutate, setExperimentId } =
    useExperimentInfo();
  const [selectedInteractSubpage, setSelectedInteractSubpage] =
    useState('chat');

  // Use authenticated fetcher from SDK

  // Extract pluginId at the top level
  const inferenceParams = experimentInfo?.config?.inferenceParams;
  const pluginId = inferenceParams
    ? SafeJSONParse(inferenceParams)?.inferenceEngine
    : null;

  // Use SWR at the top level, not inside useEffect
  const { data: modelData } = useSWR(
    experimentInfo?.id && pluginId
      ? chatAPI.Endpoints.Experiment.ScriptGetFile(
          experimentInfo.id,
          pluginId,
          'index.json',
        )
      : null,
    fetcher,
  );
  const [chatHistory, setChatHistory] = useState([]);
  useEffect(() => {
    // Clear chat history whenever the model/pluginId changes
    setChatHistory([]);
  }, [pluginId]);

  let modelSupports = [
    'chat',
    'completion',
    'rag',
    'tools',
    'template',
    'embeddings',
    'tokenize',
    'batched',
  ];

  if (
    modelData &&
    modelData !== 'null' &&
    modelData !== 'undefined' &&
    modelData !== 'FILE NOT FOUND'
  ) {
    modelSupports = SafeJSONParse(modelData)?.supports || [
      'chat',
      'completion',
      'rag',
      'tools',
      'template',
      'embeddings',
      'tokenize',
      'batched',
    ];
  }
  const setFoundation = useCallback(
    (model, additionalConfigs = {}) => {
      let model_name = '';
      let model_filename = '';

      if (model) {
        model_name = model.model_id;

        // model_filename is a real path to a local model file or directory
        // For most generated models this will be a path to a directory
        if (model.stored_in_filesystem) {
          model_filename = model.local_path;

          // If stored_in_filesystem isn't set but model_filename is then
          // just take model_filename directly
          // This is an imported model and this should hold a full path
        } else if (model.json_data?.model_filename) {
          model_filename = model.json_data.model_filename;
        }
      }

      async function updateConfigs() {
        await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Experiment.UpdateConfigs(experimentInfo?.id),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              foundation: model_name,
              foundation_model_architecture: model?.json_data?.architecture,
              foundation_filename: model_filename,
              adaptor: '', // Reset adaptor when foundation model changes
              generationParams:
                '{"temperature": 0.7,"maxTokens": 1024, "topP": 1.0, "frequencyPenalty": 0.0}',
              ...(additionalConfigs || {}),
            }),
          },
        );
        experimentInfoMutate();
      }

      updateConfigs();
    },
    [experimentInfo, experimentInfoMutate],
  );

  const setAdaptor = useCallback(
    (name) => {
      chatAPI
        .authenticatedFetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'adaptor',
            name,
          ),
        )
        .then((res) => {
          experimentInfoMutate();
        });
    },
    [experimentInfo, experimentInfoMutate],
  );

  const setEmbedding = useCallback(
    (model) => {
      let model_name = '';
      let model_filename = '';
      let model_architecture = '';

      if (model) {
        model_name = model.model_id;

        // model_filename is a real path to a local model file or directory
        if (model.stored_in_filesystem) {
          model_filename = model.local_path;
        } else if (model.json_data?.model_filename) {
          model_filename = model.json_data.model_filename;
        }

        model_architecture = model.json_data?.architecture;
      }

      async function updateConfigs() {
        await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Experiment.UpdateConfigs(experimentInfo?.id),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              embedding_model: model_name,
              embedding_model_filename: model_filename,
              embedding_model_architecture: model_architecture,
            }),
          },
        );
        experimentInfoMutate();
      }

      updateConfigs();
    },
    [experimentInfo, experimentInfoMutate],
  );

  const experimentAddEvaluation = useCallback(
    async (
      pluginName: string,
      localName: string,
      script_template_parameters: any = {},
    ) => {
      await chatAPI.EXPERIMENT_ADD_EVALUATION(
        experimentInfo?.id,
        localName,
        pluginName,
        script_template_parameters,
      );
      experimentInfoMutate();
    },
    [experimentInfo, experimentInfoMutate],
  );

  const experimentAddGeneration = useCallback(
    async (
      pluginName: string,
      localName: string,
      script_template_parameters: any = {},
    ) => {
      await chatAPI.EXPERIMENT_ADD_GENERATION(
        experimentInfo?.id,
        localName,
        pluginName,
        script_template_parameters,
      );
      experimentInfoMutate();
    },
    [experimentInfo, experimentInfoMutate],
  );

  const setRagEngine = useCallback(
    async (name: string, rag_settings: any = {}) => {
      await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Experiment.UpdateConfigs(experimentInfo?.id),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rag_engine: name,
            rag_engine_settings: JSON.stringify(rag_settings),
          }),
        },
      );
      experimentInfoMutate();
    },
    [experimentInfo, experimentInfoMutate],
  );

  if (!experimentInfo) {
    redirect('/');
  }

  return (
    <>
      {/* Include the PageTracker component to automatically track page views */}
      <PageTracker />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/experiment/notes" element={<ExperimentNotes />} />
        <Route
          path="/experiment/model"
          element={
            <FoundationHome
              pickAModelMode
              experimentInfo={experimentInfo}
              setFoundation={setFoundation}
              setAdaptor={setAdaptor}
              setLogsDrawerOpen={setLogsDrawerOpen}
            />
          }
        />
        <Route
          path="/experiment/embedding-model"
          element={
            <SelectEmbeddingModel
              experimentInfo={experimentInfo}
              setEmbedding={setEmbedding}
            />
          }
        />
        <Route path="/experiment/workflows" element={<Workflows />} />
        <Route
          path="/experiment/prompt"
          element={
            <Prompt
              experimentId={experimentInfo?.id}
              experimentInfo={experimentInfo}
              experimentInfoMutate={experimentInfoMutate}
            />
          }
        />
        <Route
          path="/experiment/chat"
          element={
            <Interact
              setRagEngine={setRagEngine}
              mode={selectedInteractSubpage}
              setMode={setSelectedInteractSubpage}
              supports={modelSupports}
              chatHistory={chatHistory}
              setChatHistory={setChatHistory}
            />
          }
        />
        <Route
          path="/experiment/model_architecture_visualization"
          element={
            <Interact
              setRagEngine={setRagEngine}
              mode="model_layers"
              setMode={setSelectedInteractSubpage}
              supports={modelSupports}
              chatHistory={chatHistory}
              setChatHistory={setChatHistory}
            />
          }
        />
        <Route path="/experiment/embeddings" element={<Embeddings />} />
        <Route path="/experiment/tokenize" element={<Tokenize />} />
        <Route path="/experiment/training" element={<TrainLoRA />} />
        <Route path="/experiment/tasks" element={<Tasks />} />

        <Route
          path="/experiment/eval"
          element={<Eval addEvaluation={experimentAddEvaluation} />}
        />
        <Route
          path="/experiment/generate"
          element={<Generate addGeneration={experimentAddGeneration} />}
        />
        <Route path="/experiment/documents" element={<Documents />} />
        <Route
          path="/experiment/rag"
          element={<Rag setRagEngine={setRagEngine} />}
        />
        <Route path="/experiment/export" element={<Export />} />
        <Route path="/experiment/diffusion" element={<Diffusion />} />
        <Route path="/experiment/audio" element={<Audio />} />
        <Route
          path="/plugins"
          element={<Plugins setLogsDrawerOpen={setLogsDrawerOpen} />}
        />
        <Route path="/plugins/:pluginName" element={<PluginDetails />} />
        <Route path="/task_library" element={<TaskLibrary />} />
        <Route path="/api" element={<Api />} />
        <Route path="/experiment/settings" element={<Settings />} />
        <Route
          path="/zoo"
          element={
            <ModelZoo
              tab="groups"
              gpuOrchestrationServer={gpuOrchestrationServer}
            />
          }
        />
        <Route
          path="/zoo/local"
          element={
            <ModelZoo
              tab="local"
              gpuOrchestrationServer={gpuOrchestrationServer}
            />
          }
        />
        <Route
          path="/zoo/generated"
          element={
            <ModelZoo
              tab="generated"
              gpuOrchestrationServer={gpuOrchestrationServer}
            />
          }
        />
        <Route
          path="/zoo/store"
          element={
            <ModelZoo
              tab="store"
              gpuOrchestrationServer={gpuOrchestrationServer}
            />
          }
        />
        <Route
          path="/zoo/groups"
          element={
            <ModelZoo
              tab="groups"
              gpuOrchestrationServer={gpuOrchestrationServer}
            />
          }
        />
        <Route
          path="/data"
          element={<Data gpuOrchestrationServer={gpuOrchestrationServer} />}
        />
        <Route path="/task_library" element={<TaskLibrary />} />
        <Route path="/computer" element={<Computer />} />
        <Route path="/settings" element={<TransformerLabSettings />} />
        <Route path="/logs" element={<Logs />} />
      </Routes>
    </>
  );
}
