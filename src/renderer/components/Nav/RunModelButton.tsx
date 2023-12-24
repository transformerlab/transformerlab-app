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

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
const fetcher = (url) => fetch(url).then((res) => res.json());

function EngineSelect({
  experimentInfo,
  inferenceSettings,
  setInferenceSettings,
}) {
  //@TODO: you should filter by type later because we only want to show
  //gguf loaders to gguf models, etc but I am testing right now
  const { data, error, isLoading } = useSWR(
    chatAPI.Endpoints.Experiment.ListScriptsOfType(
      experimentInfo?.id,
      'loader', // type
      'model_architectures:' +
        experimentInfo?.config?.foundation_model_architecture //filter
    ),
    fetcher
  );
  return (
    <Select
      placeholder={isLoading ? 'Loading...' : 'Select Engine'}
      variant="soft"
      size="lg"
      name="inferenceEngine"
      defaultValue={inferenceSettings?.inferenceEngine}
      onChange={(e, newValue) => {
        setInferenceSettings({
          ...inferenceSettings,
          inferenceEngine: newValue,
        });
      }}
    >
      <Option value={null}>Default</Option>
      {data?.map((row) => (
        <Option value={row.uniqueId} key={row.uniqueId}>
          {row.name}
        </Option>
      ))}
    </Select>
  );
}

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
      <Modal open={showRunSettings} onClose={() => setShowRunSettings(false)}>
        <ModalDialog>
          <DialogTitle>Inference Engine Settings</DialogTitle>
          <ModalClose variant="plain" sx={{ m: 1 }} />

          {/* <DialogContent>Fill in the information of the project.</DialogContent> */}
          <form
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const eightBit = document.getElementById('eightBit')?.checked;
              const cpuOffload = document.getElementById('cpuOffload')?.checked;
              const experimentId = experimentInfo?.id;

              setInferenceSettings({
                ...inferenceSettings,
                '8-bit': eightBit,
                'cpu-offload': cpuOffload,
              });

              await fetch(
                chatAPI.Endpoints.Experiment.UpdateConfig(
                  experimentId,
                  'inferenceParams',
                  JSON.stringify({
                    ...inferenceSettings,
                    '8-bit': eightBit,
                    'cpu-offload': cpuOffload,
                    inferenceEngine: inferenceSettings?.inferenceEngine,
                  })
                )
              );
              setShowRunSettings(false);
            }}
          >
            <Stack spacing={2}>
              {/* {JSON.stringify(inferenceSettings)} */}
              <FormControl>
                <FormLabel>Engine</FormLabel>
                <EngineSelect
                  experimentInfo={experimentInfo}
                  inferenceSettings={inferenceSettings}
                  setInferenceSettings={setInferenceSettings}
                />
              </FormControl>
              <FormControl
                orientation="horizontal"
                sx={{ width: 300, justifyContent: 'space-between' }}
              >
                <FormLabel>8-bit</FormLabel>
                <Switch
                  id="eightBit"
                  defaultChecked={inferenceSettings?.['8-bit']}
                />
              </FormControl>
              <FormControl
                orientation="horizontal"
                sx={{ width: 300, justifyContent: 'space-between' }}
              >
                <FormLabel>CPU Offload</FormLabel>
                <Switch
                  id="cpuOffload"
                  defaultChecked={inferenceSettings?.['cpu-offload']}
                />
              </FormControl>
              <Button type="submit">Submit</Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
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
