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
import Train from './Experiment/Train/Train';
import Eval from './Experiment/Eval/Eval';
import Export from './Experiment/Export/Export';
import Api from './Experiment/Api';
import Settings from './Experiment/Settings';
import ModelHome from './Experiment/ExperimentNotes';
import LocalModels from './ModelZoo/LocalModels';
import TrainLoRA from './Experiment/Train/TrainLoRA';
import Prompt from './Experiment/Prompt';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import ExperimentNotes from './Experiment/ExperimentNotes';
import TransformerLabSettings from './TransformerLabSettings';
import Logs from './Logs';
import FoundationHome from './Experiment/Foundation';
import LocalPlugins from './Plugins/LocalPlugins';

// This component renders the main content of the app that is shown
// On the rightmost side, regardless of what menu items are selected
// On the leftmost panel.
export default function MainAppPanel({
  experimentInfo,
  setExperimentId,
  experimentInfoMutate,
}) {
  const navigate = useNavigate();

  function setFoundation(model) {
    let model_name = '';
    let model_filename = '';

    if (model) {
      model_name = model.model_id;

      // model_filename can contain two kinds of values:
      // 1. a specific file from a HuggingFace model for models that contains many files (e.g. GGUF)
      //    This is to avoid having to download many unneeded large files
      if (model.json_data?.huggingface_filename) {
        model_filename = model.json_data.huggingface_filename;

      // 2. a fully qualified local path for locally generateed models (e.g. MLX Export)
      //    This tells the app to use the workspace/models directory instead of the HuggingFace cache
      } else if (model.local_model) {
        model_filename = model.local_path;
      }
    }

    fetch(
      chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
        experimentInfo?.id,
        'foundation',
        model_name
      )
    ).then((res) => {
      fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'foundation_model_architecture',
          model?.json_data?.architecture
        )
      ).then((res) => {
        fetch(
          chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
            experimentInfo?.id,
            'foundation_filename',
            model_filename
          )
        ).then((res) => {
          experimentInfoMutate();
        });
      });
    });
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
          />
        }
      />
      <Route
        path="/projects/embeddings"
        element={<Embeddings experimentInfo={experimentInfo} />}
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
        path="/projects/export"
        element={<Export experimentInfo={experimentInfo} />}
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
        element={<ModelZoo experimentInfo={experimentInfo} />}
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
