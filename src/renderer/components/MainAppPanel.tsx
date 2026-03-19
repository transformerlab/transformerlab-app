/* eslint-disable jsx-a11y/anchor-is-valid */

import {
  Routes,
  Route,
  useNavigate,
  redirect,
  useLocation,
  useParams,
  Outlet,
} from 'react-router-dom';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useCallback, useEffect, useState } from 'react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useAnalytics } from './Shared/analytics/AnalyticsContext';
import Data from './Data/Data';
import Welcome from './Welcome/Welcome';
import ModelZoo from './ModelZoo/ModelZoo';
import Compute from './Compute/Compute';
import Api from './Experiment/Api';
import Settings from './Experiment/Settings';
import Documents from './Experiment/Documents';
import ExperimentNotes from './Experiment/ExperimentNotes';
import UserSettings from './User/UserSettings';
import TransformerLabSettings from './Settings/TransformerLabSettings';
import Tasks from './Experiment/Tasks/Tasks';
import Interactive from './Experiment/Interactive/Interactive';
import Team from './Team/Team';
import UsageReport from './Team/UsageReport';
import TasksGallery from './TasksGallery/TasksGallery';

// // Define the app version
// const APP_VERSION = '1.0.0';

// PageTracker component to track page views
export const PageTracker = () => {
  const location = useLocation();
  const analytics = useAnalytics();

  useEffect(() => {
    const trackPageView = async () => {
      // Track page view when location changes
      // But hide the specific experiment name in the URL
      const normalizedPath = location.pathname.replace(
        /^\/experiment\/[^/]+/,
        '/experiment/:experimentName',
      );
      analytics.page({
        path: normalizedPath,
        url: window.location.href,
        search: location.search,
        title: document.title,
        context: {
          app: {
            version: window.platform?.version,
            mode: 'cloud',
          },
        },
      });
    };

    trackPageView();
  }, [location, analytics]);

  return null; // This component doesn't render anything
};

// Syncs the :experimentName URL param to the experiment context
function ExperimentLayout() {
  const { experimentName } = useParams();
  const { setExperimentId } = useExperimentInfo();

  useEffect(() => {
    if (experimentName) {
      setExperimentId(experimentName);
    }
  }, [experimentName, setExperimentId]);

  return <Outlet />;
}

// This component renders the main content of the app that is shown
// On the rightmost side, regardless of what menu items are selected
// On the leftmost panel.
export default function MainAppPanel({ setLogsDrawerOpen = null }) {
  const { experimentInfo, experimentInfoMutate, setExperimentId } =
    useExperimentInfo();
  const location = useLocation();
  // Use authenticated fetcher from SDK
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


  if (!experimentInfo) {
    redirect('/');
  }

  return (
    <>
      {/* Include the PageTracker component to automatically track page views */}
      <PageTracker />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route
          path="/experiment/:experimentName"
          element={<ExperimentLayout />}
        >
          <Route path="notes" element={<ExperimentNotes />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="interactive" element={<Interactive />} />
          <Route path="documents" element={<Documents />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="/api" element={<Api />} />
        <Route path="/zoo" element={<ModelZoo tab="groups" />} />
        <Route path="/zoo/local" element={<ModelZoo tab="local" />} />
        <Route path="/zoo/generated" element={<ModelZoo tab="generated" />} />
        <Route path="/zoo/store" element={<ModelZoo tab="store" />} />
        <Route path="/zoo/groups" element={<ModelZoo tab="groups" />} />
        <Route path="/data" element={<Data />} />
        <Route path="/tasks-gallery" element={<TasksGallery />} />
        <Route path="/compute" element={<Compute />} />
        <Route path="/settings" element={<TransformerLabSettings />} />
        <Route path="/user" element={<UserSettings />} />
        <Route path="/team" element={<Team />} />
        <Route path="/team/usage-report" element={<UsageReport />} />
      </Routes>
    </>
  );
}
