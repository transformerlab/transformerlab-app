import {
  DialogTitle,
  FormControl,
  FormLabel,
  Modal,
  ModalClose,
  ModalDialog,
  Select,
  Stack,
  Option,
  Button,
  Typography,
  Checkbox,
  Box,
} from '@mui/joy';
import React, { useMemo, useState } from 'react';
import DynamicPluginForm from '../DynamicPluginForm';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetcher, useAPI } from 'renderer/lib/transformerlab-api-sdk';

function parseJobConfig(config: unknown) {
  if (typeof config === 'object' && config !== null) {
    return config as Record<string, unknown>;
  }
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      return {};
    }
  }
  return {};
}

function EngineSelect({
  selectedPlugin,
  setSelectedPlugin,
  supportedEngines,
  unsupportedEngines,
  isLoading,
}) {
  const [showUnsupportedEngines, setShowUnsupportedEngines] = useState(false);

  return (
    <Stack spacing={1}>
      <Box>
        <Select
          placeholder={isLoading ? 'Loading...' : 'Select Engine'}
          variant="soft"
          size="lg"
          name="inferenceEngine"
          value={selectedPlugin || null}
          onChange={(e, newValue) => {
            setSelectedPlugin(newValue ? String(newValue) : null);
          }}
        >
          {supportedEngines.length > 0 &&
            supportedEngines.map((row) => (
              <Option value={row.uniqueId} key={row.uniqueId}>
                {row.name}
              </Option>
            ))}

          {showUnsupportedEngines && unsupportedEngines.length > 0 && (
            <>
              <Option disabled>── Unsupported ──</Option>
              {unsupportedEngines.map((row) => (
                <Option value={row.uniqueId} key={row.uniqueId}>
                  {row.name}
                </Option>
              ))}
            </>
          )}
        </Select>
      </Box>
      <Checkbox
        checked={showUnsupportedEngines}
        onChange={(e) => setShowUnsupportedEngines(e.target.checked)}
        label="Show unsupported engines"
      />
    </Stack>
  );
}

export default function InferenceEngineModal({
  showModal,
  setShowModal,
  experimentInfo,
  inferenceSettings,
  setInferenceSettings,
  supportedEngines,
  unsupportedEngines,
  isLoading,
}) {
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(
    inferenceSettings?.inferenceEngine || null,
  );
  const [selectedCheckpointJobId, setSelectedCheckpointJobId] = useState<
    string | null
  >(inferenceSettings?.checkpointJobId || null);
  const [selectedCheckpointName, setSelectedCheckpointName] = useState<
    string | null
  >(inferenceSettings?.checkpointName || null);

  const { data: jobsData, isLoading: jobsLoading } = useSWR(
    showModal && experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.List(experimentInfo.id)
      : null,
    fetcher,
  );

  const checkpointJobs = useMemo(() => {
    const jobs = Array.isArray(jobsData) ? jobsData : [];
    const foundation = experimentInfo?.config?.foundation;
    const adaptor = experimentInfo?.config?.adaptor;

    return jobs.filter((job) => {
      if (!job?.job_data?.checkpoints) {
        return false;
      }

      const config = parseJobConfig(job?.job_data?.config);
      const modelName = String(config['model_name'] || '');
      const adaptorName = String(config['adaptor_name'] || '');

      if (foundation && modelName && foundation !== modelName) {
        return false;
      }
      if (adaptor && adaptorName && adaptor !== adaptorName) {
        return false;
      }
      return true;
    });
  }, [
    jobsData,
    experimentInfo?.config?.foundation,
    experimentInfo?.config?.adaptor,
  ]);

  const { data: checkpointsData, isLoading: checkpointsLoading } = useAPI(
    'jobs',
    ['getCheckpoints'],
    {
      experimentId: experimentInfo?.id,
      jobId: selectedCheckpointJobId || '-1',
    },
    {
      skip: !showModal || !selectedCheckpointJobId || !experimentInfo?.id,
    },
  );
  const checkpoints = Array.isArray(checkpointsData?.checkpoints)
    ? checkpointsData.checkpoints
    : [];

  React.useEffect(() => {
    if (!showModal) {
      return;
    }
    setSelectedPlugin(inferenceSettings?.inferenceEngine || null);
    setSelectedCheckpointJobId(
      inferenceSettings?.checkpointJobId
        ? String(inferenceSettings.checkpointJobId)
        : null,
    );
    setSelectedCheckpointName(
      inferenceSettings?.checkpointName
        ? String(inferenceSettings.checkpointName)
        : null,
    );
  }, [
    showModal,
    inferenceSettings?.inferenceEngine,
    inferenceSettings?.checkpointJobId,
    inferenceSettings?.checkpointName,
  ]);

  React.useEffect(() => {
    if (!selectedCheckpointJobId || selectedCheckpointName == null) {
      return;
    }
    if (
      checkpoints.length > 0 &&
      !checkpoints.some((item) => item.filename === selectedCheckpointName)
    ) {
      setSelectedCheckpointName(null);
    }
  }, [selectedCheckpointJobId, selectedCheckpointName, checkpoints]);

  function closeModal() {
    setShowModal(false);
    setSelectedPlugin(inferenceSettings?.inferenceEngine || null);
    setSelectedCheckpointJobId(
      inferenceSettings?.checkpointJobId
        ? String(inferenceSettings.checkpointJobId)
        : null,
    );
    setSelectedCheckpointName(
      inferenceSettings?.checkpointName
        ? String(inferenceSettings.checkpointName)
        : null,
    );
  }

  return (
    <Modal open={showModal} onClose={closeModal}>
      <ModalDialog
        sx={{
          minWidth: 350,
          minHeight: 440,
        }}
      >
        <DialogTitle>Inference Engine Settings</DialogTitle>
        <ModalClose variant="plain" />

        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const formObject = Object.fromEntries(formData.entries());

            const engine =
              selectedPlugin || String(formData.get('inferenceEngine') || '');

            if (!engine) {
              closeModal();
              return;
            }

            const engineFriendlyName = document.querySelector(
              `button[name='inferenceEngine']`,
            )?.innerHTML;

            const experimentId = experimentInfo?.id;

            // We do this if else condition here because we have leftover parameters
            // which aren't accepted by another engine also getting sent when we switch engines.
            // So we need to reset the inference settings to only include the parameters for the selected engine.
            let newInferenceSettings;
            if (inferenceSettings?.inferenceEngine === engine) {
              newInferenceSettings = {
                ...inferenceSettings,
                ...formObject,
                inferenceEngine: engine,
                inferenceEngineFriendlyName: engineFriendlyName,
              };
            } else {
              newInferenceSettings = {
                ...formObject,
                inferenceEngine: engine,
                inferenceEngineFriendlyName: engineFriendlyName,
              };
            }

            delete newInferenceSettings.checkpointJobId;
            delete newInferenceSettings.checkpointName;

            if (selectedCheckpointJobId && selectedCheckpointName) {
              newInferenceSettings.checkpointJobId = selectedCheckpointJobId;
              newInferenceSettings.checkpointName = selectedCheckpointName;
            }

            setInferenceSettings(newInferenceSettings);

            await chatAPI.authenticatedFetch(
              chatAPI.Endpoints.Experiment.UpdateConfig(
                experimentId,
                'inferenceParams',
                JSON.stringify(newInferenceSettings),
              ),
            );

            closeModal();
          }}
        >
          <Stack spacing={0}>
            <FormControl>
              <FormLabel>Engine</FormLabel>
              <EngineSelect
                selectedPlugin={selectedPlugin}
                setSelectedPlugin={setSelectedPlugin}
                supportedEngines={supportedEngines}
                unsupportedEngines={unsupportedEngines}
                isLoading={isLoading}
              />
            </FormControl>

            <Typography level="title-md" paddingTop={2}>
              Checkpoint (Optional):
            </Typography>
            <FormControl>
              <FormLabel>Training Job</FormLabel>
              <Select
                placeholder={
                  jobsLoading
                    ? 'Loading checkpoint jobs...'
                    : checkpointJobs.length === 0
                      ? 'No checkpoint jobs found'
                      : 'Select training job'
                }
                value={selectedCheckpointJobId || null}
                onChange={(event, newValue) => {
                  const normalized = newValue ? String(newValue) : null;
                  setSelectedCheckpointJobId(normalized);
                  setSelectedCheckpointName(null);
                }}
              >
                {checkpointJobs.map((job) => (
                  <Option key={job.id} value={String(job.id)}>
                    Job {job.id}
                  </Option>
                ))}
              </Select>
            </FormControl>

            {selectedCheckpointJobId && (
              <FormControl sx={{ pt: 1 }}>
                <FormLabel>Checkpoint</FormLabel>
                <Select
                  placeholder={
                    checkpointsLoading
                      ? 'Loading checkpoints...'
                      : checkpoints.length === 0
                        ? 'No checkpoints found'
                        : 'Select checkpoint'
                  }
                  value={selectedCheckpointName || null}
                  onChange={(event, newValue) => {
                    setSelectedCheckpointName(
                      newValue ? String(newValue) : null,
                    );
                  }}
                >
                  {checkpoints.map((checkpoint) => (
                    <Option
                      key={`${selectedCheckpointJobId}_${checkpoint.filename}`}
                      value={checkpoint.filename}
                    >
                      {checkpoint.filename}
                    </Option>
                  ))}
                </Select>
              </FormControl>
            )}

            {(selectedCheckpointJobId || selectedCheckpointName) && (
              <Button
                variant="plain"
                size="sm"
                sx={{ alignSelf: 'flex-start', mt: 1, mb: 1 }}
                onClick={() => {
                  setSelectedCheckpointJobId(null);
                  setSelectedCheckpointName(null);
                }}
              >
                Clear checkpoint selection
              </Button>
            )}

            <Typography level="title-md" paddingTop={1}>
              Engine Configuration:
            </Typography>

            <DynamicPluginForm
              experimentInfo={experimentInfo}
              plugin={selectedPlugin}
            />

            <Button type="submit">Save</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
