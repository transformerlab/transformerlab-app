/* eslint-disable jsx-a11y/anchor-is-valid */

import {
  Routes,
  Route,
  useNavigate,
  redirect,
  useLocation,
} from 'react-router-dom';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AnalyticsBrowser } from '@segment/analytics-next';
import Data from './Data/Data';
import Interact from './Experiment/Interact/Interact';
import Embeddings from './Experiment/Embeddings';
import Welcome from './Welcome/Welcome';
import ModelZoo from './ModelZoo/ModelZoo';
import Plugins from './Plugins/Plugins';
import PluginDetails from './Plugins/PluginDetails';

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

import ExperimentNotes from './Experiment/ExperimentNotes';
import TransformerLabSettings from './Settings/TransformerLabSettings';
import Logs from './Logs';
import FoundationHome from './Experiment/Foundation';
import Workflows from './Experiment/Workflows';
import SelectEmbeddingModel from './Experiment/Foundation/SelectEmbeddingModel';

export const analytics = new AnalyticsBrowser();
analytics.load({ writeKey: 'UYXFr71CWmsdxDqki5oFXIs2PSR5XGCE' });

// Segment context provider to make analytics available throughout the app
export const SegmentContext = createContext();

export const SegmentProvider = ({ children }) => {
  return (
    <SegmentContext.Provider value={analytics}>
      {children}
    </SegmentContext.Provider>
  );
};

// Hook to use Segment analytics in components
export const useAnalytics = () => {
  return useContext(SegmentContext);
};

// // Define the app version
// const APP_VERSION = '1.0.0';

// PageTracker component to track page views
export const PageTracker = () => {
  const location = useLocation();
  const analytics = useAnalytics();

  useEffect(() => {
    const trackPageView = async () => {
      // Do not track if this is a development environment
      if (window.platform?.environment === 'development') {
        return;
      }
      // Check for the DO_NOT_TRACK value in localStorage
      const doNotTrack = await window.storage.get('DO_NOT_TRACK');
      if (doNotTrack === 'true') {
        console.log('Do not track is enabled');
        return;
      }

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
  experimentInfo,
  setExperimentId,
  experimentInfoMutate,
}) {
  const navigate = useNavigate();
  const [selectedInteractSubpage, setSelectedInteractSubpage] =
    useState('chat');

  const setFoundation = useCallback(
    (model) => {
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
        await fetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'foundation',
            model_name,
          ),
        );
        await fetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'foundation_model_architecture',
            model?.json_data?.architecture,
          ),
        );
        await fetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'foundation_filename',
            model_filename,
          ),
        );
        await fetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'generationParams',
            '{"temperature": 0.7, "maxTokens": 1024, "topP": 1.0, "frequencyPenalty": 0.0}',
          ),
        );
        experimentInfoMutate();
      }

      updateConfigs();
    },
    [experimentInfo, experimentInfoMutate],
  );

  const setAdaptor = useCallback(
    (name) => {
      fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'adaptor',
          name,
        ),
      ).then((res) => {
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
        await fetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'embedding_model',
            model_name,
          ),
        );
        await fetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'embedding_model_filename',
            model_filename,
          ),
        );
        await fetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'embedding_model_architecture',
            model_architecture,
          ),
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
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'rag_engine',
          name,
        ),
      );
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'rag_engine_settings',
          JSON.stringify(rag_settings),
        ),
      );
      experimentInfoMutate();
    },
    [experimentInfo, experimentInfoMutate],
  );

  if (!experimentInfo) {
    redirect('/');
  }

  return (
    <SegmentProvider>
      {/* Include the PageTracker component to automatically track page views */}
      <PageTracker />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route
          path="/experiment/notes"
          element={<ExperimentNotes experimentInfo={experimentInfo} />}
        />
        <Route
          path="/experiment/model"
          element={
            <FoundationHome
              pickAModelMode
              experimentInfo={experimentInfo}
              setFoundation={setFoundation}
              setAdaptor={setAdaptor}
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
        <Route
          path="/experiment/workflows"
          element={<Workflows experimentInfo={experimentInfo} />}
        />
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
              experimentInfo={experimentInfo}
              experimentInfoMutate={experimentInfoMutate}
              setRagEngine={setRagEngine}
              mode={selectedInteractSubpage}
              setMode={setSelectedInteractSubpage}
            />
          }
        />
        <Route
          path="/experiment/model_architecture_visualization"
          element={
            <Interact
              experimentInfo={experimentInfo}
              experimentInfoMutate={experimentInfoMutate}
              setRagEngine={setRagEngine}
              mode={'model_layers'}
              setMode={setSelectedInteractSubpage}
            />
          }
        />
        <Route
          path="/experiment/embeddings"
          element={<Embeddings experimentInfo={experimentInfo} />}
        />
        <Route
          path="/experiment/tokenize"
          element={<Tokenize experimentInfo={experimentInfo} />}
        />
        <Route
          path="/experiment/training"
          element={<TrainLoRA experimentInfo={experimentInfo} />}
        />
        <Route
          path="/experiment/eval"
          element={
            <Eval
              experimentInfo={experimentInfo}
              addEvaluation={experimentAddEvaluation}
              experimentInfoMutate={experimentInfoMutate}
            />
          }
        />
        <Route
          path="/experiment/generate"
          element={
            <Generate
              experimentInfo={experimentInfo}
              addGeneration={experimentAddGeneration}
              experimentInfoMutate={experimentInfoMutate}
            />
          }
        />
        <Route
          path="/experiment/documents"
          element={<Documents experimentInfo={experimentInfo} />}
        />
        <Route
          path="/experiment/rag"
          element={
            <Rag experimentInfo={experimentInfo} setRagEngine={setRagEngine} />
          }
        />
        <Route
          path="/experiment/export"
          element={<Export experimentInfo={experimentInfo} />}
        />
        <Route
          path="/experiment/generate"
          element={<Generate experimentInfo={experimentInfo} />}
        />
        <Route
          path="/plugins"
          element={<Plugins experimentInfo={experimentInfo} />}
        />
        <Route
          path="/plugins/:pluginName"
          element={<PluginDetails experimentInfo={experimentInfo} />}
        />
        <Route path="/api" element={<Api />} />
        <Route
          path="/experiment/settings"
          element={
            <Settings
              experimentInfo={experimentInfo}
              setExperimentId={setExperimentId}
              experimentInfoMutate={experimentInfoMutate}
            />
          }
        />
        <Route
          path="/zoo"
          element={<ModelZoo experimentInfo={experimentInfo} tab="store" />}
        />
        <Route
          path="/zoo/local"
          element={<ModelZoo experimentInfo={experimentInfo} tab="local" />}
        />
        <Route
          path="/zoo/generated"
          element={<ModelZoo experimentInfo={experimentInfo} tab="generated" />}
        />
        <Route
          path="/zoo/store"
          element={<ModelZoo experimentInfo={experimentInfo} tab="store" />}
        />
        <Route path="/data" element={<Data />} />
        <Route path="/computer" element={<Computer />} />
        <Route path="/settings" element={<TransformerLabSettings />} />
        <Route path="/logs" element={<Logs />} />
      </Routes>
    </SegmentProvider>
  );
}
