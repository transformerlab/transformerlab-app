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
} from '@mui/joy';
import { CogIcon, PlayCircleIcon, StopCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { activateWorker } from 'renderer/lib/transformerlab-api-sdk';

import InferenceEngineModal from './InferenceEngineModal';

export default function RunModelButton({
  experimentInfo,
  killWorker,
  models,
  mutate = () => {},
}) {
  const [jobId, setJobId] = useState(null);
  const [showRunSettings, setShowRunSettings] = useState(false);
  const [inferenceSettings, setInferenceSettings] = useState({
    '8-bit': false,
    'cpu-offload': false,
    inferenceEngine: null,
  });

  function isPossibleToRunAModel() {
    return experimentInfo != null && experimentInfo?.config?.foundation !== '';
  }

  useEffect(() => {
    if (experimentInfo?.config?.inferenceParams) {
      setInferenceSettings(JSON.parse(experimentInfo?.config?.inferenceParams));
    }
  }, [experimentInfo]);

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
            onClick={async () => {
              setJobId(-1);

              const eightBit = inferenceSettings?.['8-bit'];
              const cpuOffload = inferenceSettings?.['cpu-offload'];
              const inferenceEngine = inferenceSettings?.inferenceEngine;

              const response = await activateWorker(
                experimentInfo?.config?.foundation,
                experimentInfo?.config?.foundation_filename,
                experimentInfo?.config?.adaptor,
                eightBit,
                cpuOffload,
                inferenceEngine,
                experimentInfo?.id
              );
              const job_id = response?.job_id;
              setJobId(job_id);
              mutate();
            }}
            disabled={!isPossibleToRunAModel()}
          >
            Run
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
        <CogIcon color="var(--joy-palette-neutral-500)" />
      </IconButton>
      <InferenceEngineModal
        showModal={showRunSettings}
        setShowModal={setShowRunSettings}
        experimentInfo={experimentInfo}
        inferenceSettings={inferenceSettings}
        setInferenceSettings={setInferenceSettings}
      />
      <Stack
        sx={{ fontSize: '12px', minWidth: '80px' }}
        justifyContent="space-between"
      >
        {inferenceSettings?.inferenceEngine}
        {inferenceSettings?.['8-bit'] && <div>8-bit Mode</div>}
        {inferenceSettings?.['cpu-offload'] && <div>CPU-Offload</div>}
      </Stack>
    </div>
  );
}
