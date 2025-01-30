/* eslint-disable jsx-a11y/anchor-is-valid */

import { Routes, Route, useNavigate, redirect } from 'react-router-dom';

import Data from './Data/Data';
import Interact from './Experiment/Interact/Interact';
import Embeddings from './Experiment/Embeddings';
import Welcome from './Welcome';
import ModelZoo from './ModelZoo/ModelZoo';
import Plugins from './Plugins/Plugins';
import PluginDetails from './Plugins/PluginDetails';

import Computer from './Computer';
import Eval from './Experiment/Eval/Eval';
import Export from './Experiment/Export/Export';
import Api from './Experiment/Api';
import Settings from './Experiment/Settings';
import ModelHome from './Experiment/ExperimentNotes';
import TrainLoRA from './Experiment/Train/TrainLoRA';
import Prompt from './Experiment/Prompt';
import Documents from './Experiment/Documents';
import Rag from './Experiment/Rag';
import Tokenize from './Experiment/Interact/Tokenize';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import ExperimentNotes from './Experiment/ExperimentNotes';
import TransformerLabSettings from './TransformerLabSettings';
import Logs from './Logs';
import FoundationHome from './Experiment/Foundation';
import { useState } from 'react';
import Generate from './Experiment/Generate/Generate';

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

  function setFoundation(model) {
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
          model_name
        )
      );
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'foundation_model_architecture',
          model?.json_data?.architecture
        )
      );
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'foundation_filename',
          model_filename
        )
      );
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'generationParams',
          '{"temperature": 0.7, "maxTokens": 1024, "topP": 1.0, "frequencyPenalty": 0.0}'
        )
      );
      experimentInfoMutate();
    }

    updateConfigs();
  }

  function setAdaptor(name) {
    fetch(
      chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
        experimentInfo?.id,
        'adaptor',
        name
      )
    ).then((res) => {
      experimentInfoMutate();
    });
  }

  async function experimentAddEvaluation(
    pluginName: string,
    localName: string,
    script_template_parameters: any = {}
  ) {
    await chatAPI.EXPERIMENT_ADD_EVALUATION(
      experimentInfo?.id,
      localName,
      pluginName,
      script_template_parameters
    );
    experimentInfoMutate();
  }

  async function setRagEngine(name: string, rag_settings: any = {}) {
    await fetch(
      chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
        experimentInfo?.id,
        'rag_engine',
        name
      )
    );
    await fetch(
      chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
        experimentInfo?.id,
        'rag_engine_settings',
        JSON.stringify(rag_settings)
      )
    );
    experimentInfoMutate();
  }

  if (!experimentInfo) {
    redirect('/');
  }

  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route
        path="/projects/notes"
        element={<ExperimentNotes experimentInfo={experimentInfo} />}
      />
      <Route
        path="/projects/model"
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
        path="/projects/prompt"
        element={
          <Prompt
            experimentId={experimentInfo?.id}
            experimentInfo={experimentInfo}
            experimentInfoMutate={experimentInfoMutate}
          />
        }
      />
      <Route
        path="/projects/chat"
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
        path="/projects/embeddings"
        element={<Embeddings experimentInfo={experimentInfo} />}
      />
      <Route
        path="/projects/tokenize"
        element={<Tokenize experimentInfo={experimentInfo} />}
      />
      <Route
        path="/projects/training"
        element={<TrainLoRA experimentInfo={experimentInfo} />}
      />
      <Route
        path="/projects/eval"
        element={
          <Eval
            experimentInfo={experimentInfo}
            addEvaluation={experimentAddEvaluation}
            experimentInfoMutate={experimentInfoMutate}
          />
        }
      />
      <Route
        path="/projects/documents"
        element={<Documents experimentInfo={experimentInfo} />}
      />
      <Route
        path="/projects/rag"
        element={
          <Rag experimentInfo={experimentInfo} setRagEngine={setRagEngine} />
        }
      />
      <Route
        path="/projects/export"
        element={<Export experimentInfo={experimentInfo} />}
      />
      <Route
        path="/projects/generate"
        element={<Generate experimentInfo={experimentInfo} />}
      />
      <Route
        path="/projects/plugins"
        element={<Plugins experimentInfo={experimentInfo} />}
      />
      <Route
        path="/projects/plugins/:pluginName"
        element={<PluginDetails experimentInfo={experimentInfo} />}
      />
      <Route path="/projects/api" element={<Api />} />
      <Route
        path="/projects/settings"
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
      <Route
        path="/model-home"
        element={<ModelHome experimentInfo={experimentInfo} />}
      />
      <Route path="/computer" element={<Computer />} />
      <Route path="/settings" element={<TransformerLabSettings />} />
      <Route path="/logs" element={<Logs />} />
    </Routes>
  );
}
