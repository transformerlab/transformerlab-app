import {
  Button,
  CircularProgress,
  DialogTitle,
  FormControl,
  FormLabel,
  IconButton,
  Modal,
  ModalClose,
  ModalDialog,
  Select,
  Stack,
  Switch,
  Option,
  Typography,
  Tooltip,
} from '@mui/joy';
import { CogIcon, PlayCircleIcon, StopCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { activateWorker } from 'renderer/lib/transformerlab-api-sdk';

import InferenceEngineModal from './InferenceEngineModal';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function RunModelButton({
  experimentInfo,
  killWorker,
  models,
  mutate = () => {},
}) {
  const [jobId, setJobId] = useState(null);
  const [showRunSettings, setShowRunSettings] = useState(false);
  const [inferenceSettings, setInferenceSettings] = useState({
    inferenceEngine: null,
  });

  const {
    data: inferenceEngines,
    error: inferenceEnginesError,
    isLoading: inferenceEnginesIsLoading,
  } = useSWR(
    inferenceSettings?.inferenceEngine == null &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'loader', // type
        'model_architectures:' +
          experimentInfo?.config?.foundation_model_architecture //filter
      ),
    fetcher
  );

  function isPossibleToRunAModel() {
    return (
      experimentInfo != null &&
      experimentInfo?.config?.foundation !== '' &&
      inferenceSettings?.inferenceEngine !== null
    );
  }

  useEffect(() => {
    if (experimentInfo?.config?.inferenceParams) {
      setInferenceSettings(JSON.parse(experimentInfo?.config?.inferenceParams));
    }
  }, [experimentInfo]);

  // Set a default inference Engine if there is none
  useEffect(() => {
    if (
      inferenceEngines?.length > 0 &&
      inferenceSettings?.inferenceEngine == null
    ) {
      setInferenceSettings({
        inferenceEngine: inferenceEngines[0].uniqueId,
      });
    }
  }, [inferenceEngines]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '0px',
      }}
    >
      {/* {JSON.stringify(models)} */}
      {/* {jobId} */}
      {/* {JSON.stringify(experimentInfo)} */}
      {/* {JSON.stringify(inferenceEngines)} */}
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
              const job_id = response?.job_id;
              setJobId(job_id);
              mutate();
            }}
            disabled={!isPossibleToRunAModel()}
          >
            Run with {inferenceSettings?.inferenceEngine}
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
      <IconButton
        variant="plain"
        color="neutral"
        size="md"
        disabled={models?.length > 0 || jobId == -1}
        onClick={() => setShowRunSettings(!showRunSettings)}
      >
        <Tooltip
          variant="soft"
          title={
            <Stack
              sx={{ fontSize: '12px', minWidth: '80px' }}
              justifyContent="space-between"
            >
              {Object.entries(inferenceSettings)?.map(([key, value]) => (
                <Typography key={key}>
                  {key}: {value}
                </Typography>
              ))}
            </Stack>
          }
        >
          <CogIcon color="var(--joy-palette-neutral-500)" />
        </Tooltip>
      </IconButton>
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
