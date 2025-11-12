import {
  Alert,
  Button,
  CircularProgress,
  Typography,
  Skeleton,
  Box,
} from '@mui/joy';
import {
  CheckCheckIcon,
  CheckCircle2Icon,
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
import React from 'react';

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
  const [stopping, setStopping] = useState(false);
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

  const { data: pipelineTagData, isLoading: pipelineTagLoading } = useAPI(
    'models',
    ['pipeline_tag'],
    {
      modelName: experimentInfo?.config?.foundation,
    },
    {
      skip: !experimentInfo?.config?.foundation,
    },
  );

  const pipelineTag = pipelineTagData?.data || null;

  const archTag = experimentInfo?.config?.foundation_model_architecture ?? '';

  const supportedEngines = React.useMemo(() => {
    if (!data || pipelineTagLoading) return [];

    return data.filter((row) => {
      const supportsArchitecture =
        Array.isArray(row.model_architectures) &&
        row.model_architectures.some(
          (arch) => arch.toLowerCase() === archTag.toLowerCase(),
        );

      if (!supportsArchitecture) return false;

      const hasTextToSpeechSupport =
        Array.isArray(row.supports) &&
        row.supports.some(
          // Some models list as text-to-speech, others as text-to-audio
          (support: string) =>
            support.toLowerCase() === 'text-to-speech' ||
            pipelineTag === 'text-to-audio',
        );

      // For text-to-speech models: must also have text-to-speech support
      if (pipelineTag === 'text-to-speech') {
        return hasTextToSpeechSupport;
      }

      // For non-text-to-speech models: must NOT have text-to-speech support
      return !hasTextToSpeechSupport;
    });
  }, [data, pipelineTagLoading, pipelineTag, archTag]);

  const unsupportedEngines = React.useMemo(() => {
    if (!data) return [];

    // Simply return everything that's NOT in supportedEngines
    return data.filter(
      (row) =>
        !supportedEngines.some(
          (supported) => supported.uniqueId === row.uniqueId,
        ),
    );
  }, [data, supportedEngines]);

  const [isValidDiffusionModel, setIsValidDiffusionModel] = useState<
    boolean | null
  >(null);

  // Prevent transient UI while we determine/commit inference engine defaults
  const [inferenceLoading, setInferenceLoading] = useState(true);

  function isPossibleToRunAModel() {
    return (
      experimentInfo != null &&
      experimentInfo?.config?.foundation !== '' &&
      inferenceSettings?.inferenceEngine != null &&
      !inferenceLoading &&
      !pipelineTagLoading
    );
  }

  async function getDefaultinferenceEngines() {
    const inferenceEngines = await chatAPI.authenticatedFetch(
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'loader', // type
        'model_architectures:' +
          experimentInfo?.config?.foundation_model_architecture, //filter
      ),
      {},
    );
    const inferenceEnginesJSON = await inferenceEngines.json();
    const experimentId = experimentInfo?.id;
    const engine = inferenceEnginesJSON?.[0]?.uniqueId;
    const inferenceEngineFriendlyName = inferenceEnginesJSON?.[0]?.name || '';

    await chatAPI.authenticatedFetch(
      chatAPI.Endpoints.Experiment.UpdateConfig(
        experimentId,
        'inferenceParams',
        JSON.stringify({
          ...inferenceSettings,
          inferenceEngine: engine || null,
          inferenceEngineFriendlyName: inferenceEngineFriendlyName || null,
        }),
      ),
      {},
    );

    return {
      inferenceEngine: engine || null,
      inferenceEngineFriendlyName: inferenceEngineFriendlyName || null,
    };
  }

  // Set a default inference Engine if there is none
  useEffect(() => {
    // Add this single line to wait for pipeline tag loading
    if (!data || pipelineTagLoading) return;

    setInferenceLoading(true);

    (async () => {
      let objExperimentInfo = null;
      if (experimentInfo?.config?.inferenceParams) {
        try {
          objExperimentInfo = JSON.parse(
            experimentInfo?.config?.inferenceParams,
          );
        } catch {
          objExperimentInfo = null;
        }
      }

      // Check if current engine is still supported after filtering
      const currentEngine = objExperimentInfo?.inferenceEngine;
      const currentEngineIsSupported = supportedEngines.some(
        (engine) => engine.uniqueId === currentEngine,
      );

      if (
        objExperimentInfo == null ||
        objExperimentInfo?.inferenceEngine == null ||
        !currentEngineIsSupported
      ) {
        // If there are supportedEngines, set the first one from supported engines as default
        if (supportedEngines.length > 0) {
          const firstEngine = supportedEngines[0];
          const newInferenceSettings = {
            inferenceEngine: firstEngine.uniqueId || null,
            inferenceEngineFriendlyName: firstEngine.name || '',
          };
          setInferenceSettings(newInferenceSettings);

          // await update so UI doesn't re-render with stale/partial state
          if (experimentInfo?.id) {
            try {
              await chatAPI.authenticatedFetch(
                chatAPI.Endpoints.Experiment.UpdateConfig(
                  experimentInfo.id,
                  'inferenceParams',
                  JSON.stringify(newInferenceSettings),
                ),
              );
            } catch (err) {
              console.error(
                'Failed to update inferenceParams in experiment config',
                err,
              );
            }
          }
        } else {
          const { inferenceEngine, inferenceEngineFriendlyName } =
            await getDefaultinferenceEngines();
          setInferenceSettings({
            inferenceEngine: inferenceEngine || null,
            inferenceEngineFriendlyName: inferenceEngineFriendlyName || null,
          });
        }
      } else {
        setInferenceSettings(objExperimentInfo);
      }

      setInferenceLoading(false);
    })();
  }, [
    data,
    pipelineTagLoading,
    supportedEngines,
    experimentInfo?.id,
    experimentInfo?.config?.inferenceParams,
  ]);

  // Check if the current foundation model is a diffusion model
  useEffect(() => {
    const checkValidDiffusion = async () => {
      if (!experimentInfo?.config?.foundation) {
        setIsValidDiffusionModel(false);
        return;
      }

      try {
        const response = await chatAPI.authenticatedFetch(
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
              if (stopping) return;
              setStopping(true);
              try {
                await killWorker();
              } catch (err) {
                console.error('Error stopping the worker:', err);
              } finally {
                setStopping(false);
                setJobId(null);
                try {
                  await mutate();
                } catch (err) {
                  console.error(
                    'Error mutating after stopping the worker:',
                    err,
                  );
                }
              }
            }}
            startDecorator={
              stopping || models?.length == 0 ? (
                <CircularProgress size="sm" thickness={2} />
              ) : (
                <StopCircleIcon />
              )
            }
            color="success"
            size="lg"
            sx={{ fontSize: '1.1rem', marginRight: 1, minWidth: '200px' }}
          >
            {stopping ? 'Stopping...' : 'Stop'}
          </Button>
        )}
        <Button
          variant="plain"
          onClick={() => setShowRunSettings(!showRunSettings)}
          disabled={models?.length > 0 || jobId == -1 || inferenceLoading}
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

  // Show loading skeleton while determining engines
  const isDeterminingEngines =
    isLoading || pipelineTagLoading || inferenceLoading;

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
      {isDeterminingEngines ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            gap: 1,
            alignItems: 'center',
          }}
        >
          <Skeleton
            variant="rectangular"
            width={200}
            height={40}
            sx={{ borderRadius: 'sm' }}
          />
          <Skeleton
            variant="rectangular"
            width={120}
            height={40}
            sx={{ borderRadius: 'sm' }}
          />
        </Box>
      ) : supportedEngines.length > 0 ? (
        <Engine />
      ) : isValidDiffusionModel === true ? (
        <Alert startDecorator={<CheckCircle2Icon />} color="success">
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
