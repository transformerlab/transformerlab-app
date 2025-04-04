import { Alert, Button, CircularProgress, Typography } from '@mui/joy';
import {
  InfoIcon,
  PlayCircleIcon,
  Plug2Icon,
  StopCircleIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { activateWorker } from 'renderer/lib/transformerlab-api-sdk';

import InferenceEngineModal from './InferenceEngineModal';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import OneTimePopup from 'renderer/components/Shared/OneTimePopup';

const fetcher = (url) => fetch(url).then((res) => res.json());

import { Link } from 'react-router-dom';

function removeServerFromEndOfString(str) {
  if (str == null) {
    return null;
  }
  // If the word "Server" is at the end of the string, remove it
  if (str.endsWith(' Server')) {
    return str.slice(0, -7);
  }
}

export default function RunModelButton({
  experimentInfo,
  killWorker,
  models,
  mutate = () => { },
}) {
  const [jobId, setJobId] = useState(null);
  const [showRunSettings, setShowRunSettings] = useState(false);
  const [inferenceSettings, setInferenceSettings] = useState({
    inferenceEngine: null,
    inferenceEngineFriendlyName: '',
  });

  function isPossibleToRunAModel() {
    // console.log('Is Possible?');
    // console.log(experimentInfo);
    // console.log(inferenceSettings);
    return (
      experimentInfo != null &&
      experimentInfo?.config?.foundation !== '' &&
      inferenceSettings?.inferenceEngine != null
    );
  }

  // Set a default inference Engine if there is none
  useEffect(() => {
    // Update experiment inference parameters so the Run button shows correctly
    if (experimentInfo?.config?.inferenceParams) {
      setInferenceSettings(JSON.parse(experimentInfo?.config?.inferenceParams));
    }

    // console.log('Searching for primary inference engine');
    // console.log(inferenceSettings);
    (async () => {
      if (inferenceSettings?.inferenceEngine == null) {
        const inferenceEngines = await fetch(
          chatAPI.Endpoints.Experiment.ListScriptsOfType(
            experimentInfo?.id,
            'loader', // type
            'model_architectures:' +
            experimentInfo?.config?.foundation_model_architecture //filter
          )
        );
        const inferenceEnginesJSON = await inferenceEngines.json();
        const experimentId = experimentInfo?.id;
        const engine = inferenceEnginesJSON?.[0]?.uniqueId;

        await fetch(
          chatAPI.Endpoints.Experiment.UpdateConfig(
            experimentId,
            'inferenceParams',
            JSON.stringify({
              ...inferenceSettings,
              inferenceEngine: engine,
            })
          )
        );
        setInferenceSettings({
          inferenceEngine: inferenceEnginesJSON?.[0]?.uniqueId,
        });
      }
    })();
  }, [experimentInfo]);

  function Engine() {
    return (
      <>
        {models === null ? (
          <>
            <Button
              startDecorator={
                jobId === -1 ? (
                  <CircularProgress size="sm" thickness={2} />
                ) : (
                  <PlayCircleIcon />
                )
              }
              color="success"
              size="lg"
              sx={{ fontSize: '1.1rem', marginRight: 1, minWidth: '200px' }}
              onClick={async (e) => {
                if (inferenceSettings?.inferenceEngine === null) {
                  setShowRunSettings(!showRunSettings);
                  return;
                }

                setJobId(-1);

                const inferenceEngine = inferenceSettings?.inferenceEngine;

                const response = await activateWorker(
                  experimentInfo?.config?.foundation,
                  experimentInfo?.config?.foundation_filename,
                  experimentInfo?.config?.adaptor,
                  inferenceEngine,
                  inferenceSettings,
                  experimentInfo?.id
                );
                if (response?.status == 'error') {
                  alert(`Failed to start model:\n${response?.message}`);
                  setJobId(null);
                  return;
                }
                const job_id = response?.job_id;
                setJobId(job_id);
                mutate();
              }}
              disabled={!isPossibleToRunAModel()}
            >
              {isPossibleToRunAModel() ? 'Run' : 'No Available Engine'}
            </Button>
          </>
        ) : (
          <Button
            onClick={async () => {
              await killWorker();
              setJobId(null);
            }}
            startDecorator={
              models?.length == 0 ? (
                <CircularProgress size="sm" thickness={2} />
              ) : (
                <StopCircleIcon />
              )
            }
            color="success"
            size="lg"
            sx={{ fontSize: '1.1rem', marginRight: 1, minWidth: '200px' }}
          >
            Stop
          </Button>
        )}
        <Button
          variant="plain"
          onClick={() => setShowRunSettings(!showRunSettings)}
          disabled={models?.length > 0 || jobId == -1}
        >
          using{' '}
          {removeServerFromEndOfString(
            inferenceSettings?.inferenceEngineFriendlyName
          ) ||
            inferenceSettings?.inferenceEngine ||
            'Engine'}
        </Button>
      </>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '0px',
      }}
    >
      {models != null && (
        <OneTimePopup title="Congratulations on Running your first Model 🚀">
          You can now go to <b>Interact</b>, <b>Query Docs</b>, and{' '}
          <b>Embeddings</b> tabs to chat with it.
        </OneTimePopup>
      )}
      {/* {JSON.stringify(models)} */}
      {/* {jobId} */}
      {/* {JSON.stringify(experimentInfo)} */}
      {/* {JSON.stringify(inferenceSettings)} */}
      {isPossibleToRunAModel() ? (
        <Engine />
      ) : (
        <Alert startDecorator={<TriangleAlertIcon />} color="warning" size="lg">
          <Typography>
            You do not have an installed Inference Engine that is compatible
            with this model. Go to{' '}
            <Link to="/plugins">
              <Plug2Icon size="15px" />
              Plugins
            </Link>{' '}
            and install an Inference Engine. <b>FastChat Server</b> is a good
            default for systems with a GPU. <b>Apple MLX Server</b> is the best
            default for MacOS with Apple Silicon.
          </Typography>
        </Alert>
      )}
      <InferenceEngineModal
        showModal={showRunSettings}
        setShowModal={setShowRunSettings}
        experimentInfo={experimentInfo}
        inferenceSettings={inferenceSettings}
        setInferenceSettings={setInferenceSettings}
      />
    </div>
  );
}
