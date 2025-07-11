import { Alert, Button, CircularProgress, Typography } from '@mui/joy';
import {
  InfoIcon,
  PlayCircleIcon,
  Plug2Icon,
  StopCircleIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { RiImageAiLine } from 'react-icons/ri';
import { useEffect, useState } from 'react';

import {
  activateWorker,
  getAPIFullPath,
} from 'renderer/lib/transformerlab-api-sdk';

import InferenceEngineModal from './InferenceEngineModal';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import OneTimePopup from 'renderer/components/Shared/OneTimePopup';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import React, { useState } from 'react';

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
  mutate = () => {},
  setLogsDrawerOpen = null,
}) {
  const [jobId, setJobId] = useState(null);
  const [showRunSettings, setShowRunSettings] = useState(false);
  const [inferenceSettings, setInferenceSettings] = useState({
    inferenceEngine: null,
    inferenceEngineFriendlyName: '',
  });

  const { data, error, isLoading } = useAPI(
    'experiment',
    ['getScriptsOfTypeWithoutFilter'],
    {
      experimentId: experimentInfo?.id,
      type: 'loader',
    },
    {
      skip: !experimentInfo?.id,
    },
  );

  const archTag = experimentInfo?.config?.foundation_model_architecture ?? '';

  const supportedEngines = React.useMemo(() => {
    if (!data) {
      return [];
    }
    const filtered = data.filter(
      (row) =>
        Array.isArray(row.model_architectures) &&
        row.model_architectures.some(
          (arch) => arch.toLowerCase() === archTag.toLowerCase(),
        ),
    );
    return filtered;
  }, [data, archTag]);

  const unsupportedEngines = React.useMemo(() => {
    if (!data) {
      return [];
    }
    const filtered = data.filter(
      (row) =>
        !Array.isArray(row.model_architectures) ||
        !row.model_architectures.some(
          (arch) => arch.toLowerCase() === archTag.toLowerCase(),
        ),
    );
    return filtered;
  }, [data, archTag]);

  const [isValidDiffusionModel, setIsValidDiffusionModel] = useState<
    boolean | null
  >(null);

  function isPossibleToRunAModel() {
    return (
      experimentInfo != null &&
      experimentInfo?.config?.foundation !== '' &&
      inferenceSettings?.inferenceEngine != null
    );
  }

  async function getDefaultinferenceEngines() {
    const inferenceEngines = await fetch(
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'loader', // type
        'model_architectures:' +
          experimentInfo?.config?.foundation_model_architecture, //filter
      ),
    );
    const inferenceEnginesJSON = await inferenceEngines.json();
    const experimentId = experimentInfo?.id;
    const engine = inferenceEnginesJSON?.[0]?.uniqueId;
    const inferenceEngineFriendlyName = inferenceEnginesJSON?.[0]?.name || '';

    await fetch(
      chatAPI.Endpoints.Experiment.UpdateConfig(
        experimentId,
        'inferenceParams',
        JSON.stringify({
          ...inferenceSettings,
          inferenceEngine: engine || null,
          inferenceEngineFriendlyName: inferenceEngineFriendlyName || null,
        }),
      ),
    );

    return {
      inferenceEngine: engine || null,
      inferenceEngineFriendlyName: inferenceEngineFriendlyName || null,
    };
  }

  // Set a default inference Engine if there is none
  useEffect(() => {
    let objExperimentInfo = null;
    if (experimentInfo?.config?.inferenceParams) {
      objExperimentInfo = JSON.parse(experimentInfo?.config?.inferenceParams);
    }
    if (
      objExperimentInfo == null ||
      objExperimentInfo?.inferenceEngine == null
    ) {
      // If there are supportedEngines, set the first one from supported engines as default
      if (supportedEngines.length > 0) {
        const firstEngine = supportedEngines[0];
        const newInferenceSettings = {
          inferenceEngine: firstEngine.uniqueId || null,
          inferenceEngineFriendlyName: firstEngine.name || '',
        };
        setInferenceSettings(newInferenceSettings);

        // Update the experiment config with the first supported engine
        if (experimentInfo?.id) {
          fetch(
            chatAPI.Endpoints.Experiment.UpdateConfig(
              experimentInfo.id,
              'inferenceParams',
              JSON.stringify(newInferenceSettings),
            ),
          ).catch(() => {
            console.error(
              'Failed to update inferenceParams in experiment config',
            );
          });
        }
      } else {
        // This preserves the older logic where we try to get the default inference engine for a blank experiment
        (async () => {
          const { inferenceEngine, inferenceEngineFriendlyName } =
            await getDefaultinferenceEngines();
          setInferenceSettings({
            inferenceEngine: inferenceEngine || null,
            inferenceEngineFriendlyName: inferenceEngineFriendlyName || null,
          });
        })();
      }
    } else {
      setInferenceSettings(objExperimentInfo);
    }
  }, [experimentInfo, supportedEngines]);

  // Check if the current foundation model is a diffusion model
  useEffect(() => {
    const checkValidDiffusion = async () => {
      if (!experimentInfo?.config?.foundation) {
        setIsValidDiffusionModel(false);
        return;
      }

      try {
        const response = await fetch(
          getAPIFullPath('diffusion', ['checkValidDiffusion'], {}),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: experimentInfo.config.foundation }),
          },
        );
        const data = await response.json();
        setIsValidDiffusionModel(data.is_valid_diffusion_model);
      } catch (e) {
        setIsValidDiffusionModel(false);
      }
    };

    checkValidDiffusion();
  }, [experimentInfo?.config?.foundation]);

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
                  experimentInfo?.config?.foundation_model_architecture,
                  experimentInfo?.config?.adaptor,
                  inferenceEngine,
                  inferenceSettings,
                  experimentInfo?.id,
                );
                if (response?.status == 'error') {
                  if (setLogsDrawerOpen) {
                    setLogsDrawerOpen(true);
                  }
                  if (
                    response?.message?.includes(
                      'Process terminated with exit code 1',
                    )
                  ) {
                    alert(
                      'Could not start model. Please check the console at the bottom of the page for detailed logs.',
                    );
                  } else {
                    alert(`Failed to start model:\n${response?.message}`);
                  }
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
            inferenceSettings?.inferenceEngineFriendlyName,
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
      {supportedEngines.length > 0 ? (
        <Engine />
      ) : isValidDiffusionModel === true ? (
        <Alert startDecorator={<InfoIcon />} color="warning">
          <Typography level="body-sm">
            You can now run inference using this diffusion model. Go to{' '}
            <Link to="/experiment/diffusion">
              <RiImageAiLine
                size="16px"
                style={{ verticalAlign: 'middle', marginRight: '2px' }}
              />
              Diffusion
            </Link>{' '}
            to generate images with it.
          </Typography>
        </Alert>
      ) : unsupportedEngines.length > 0 ? (
        <div>
          <Alert startDecorator={<TriangleAlertIcon />} color="warning">
            <Typography level="body-sm">
              None of the installed Engines currently support this model
              architecture. You can try a different engine in{' '}
              <Link to="/plugins">
                <Plug2Icon size="15px" />
                Plugins
              </Link>{' '}
              , or you can try running it with an unsupported Engine by clicking{' '}
              <b>using Engine</b> below and check{' '}
              <b>Show unsupported engines</b>.
            </Typography>
          </Alert>
          <div style={{ marginTop: 16 }}>
            <Engine />
          </div>
        </div>
      ) : (
        <Alert startDecorator={<TriangleAlertIcon />} color="warning">
          <Typography level="body-sm">
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
        supportedEngines={supportedEngines}
        unsupportedEngines={unsupportedEngines}
        isLoading={isLoading}
      />
    </div>
  );
}
