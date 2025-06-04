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
} from '@mui/joy';
import React, { useState } from 'react';
import DynamicPluginForm from '../DynamicPluginForm';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

function EngineSelect({
  experimentInfo,
  inferenceSettings,
  setSelectedPlugin,
  showUnsupported,
  setShowUnsupported,
}) {
  const { data, error, isLoading } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Experiment.ListScriptsOfType(
          experimentInfo.id,
          'loader',
          ''
        )
      : null,
    fetcher
  );

  const archTag = experimentInfo?.config?.foundation_model_architecture ?? '';

  const supported = React.useMemo(() => {
    if (!data) return [];
    return data.filter(
      (row) =>
        Array.isArray(row.model_architectures) &&
        row.model_architectures.some(
          (arch) => arch.toLowerCase() === archTag.toLowerCase()
        )
    );
  }, [data, archTag]);

  const unsupported = React.useMemo(() => {
    if (!data) return [];
    return data.filter(
      (row) =>
        !Array.isArray(row.model_architectures) ||
        !row.model_architectures.some(
          (arch) => arch.toLowerCase() === archTag.toLowerCase()
        )
    );
  }, [data, archTag]);

  return (
    <Stack spacing={1}>
      <Checkbox
        checked={showUnsupported}
        onChange={(e) => setShowUnsupported(e.target.checked)}
        label="Show unsupported engines"
      />

      <Select
        placeholder={isLoading ? 'Loading...' : 'Select Engine'}
        variant="soft"
        size="lg"
        name="inferenceEngine"
        defaultValue="Select Engine"
        onChange={(e, newValue) => {
          setSelectedPlugin(newValue);
        }}
      >
        {supported.length > 0 &&
          supported.map((row) => (
            <Option value={row.uniqueId} key={row.uniqueId}>
              {row.name}
            </Option>
          ))}

        {showUnsupported && unsupported.length > 0 && (
          <>
            <Option disabled>── Unsupported ──</Option>
            {unsupported.map((row) => (
              <Option value={row.uniqueId} key={row.uniqueId}>
                {row.name}
              </Option>
            ))}
          </>
        )}
      </Select>
    </Stack>
  );
}

export default function InferenceEngineModal({
  showModal,
  setShowModal,
  experimentInfo,
  inferenceSettings,
  setInferenceSettings,
}) {
  const [selectedPlugin, setSelectedPlugin] = useState(null);

  // New state for showUnsupported moved here to control dialog size & checkbox
  const [showUnsupported, setShowUnsupported] = useState(false);

  function closeModal() {
    setShowModal(false);
    setSelectedPlugin(inferenceSettings?.inferenceEngine);
  }

  return (
    <Modal open={showModal} onClose={closeModal}>
      <ModalDialog
        sx={{
          minWidth: showUnsupported ? 350 : 350,
          minHeight: showUnsupported ? 440 : 300,
        }}
      >
        <DialogTitle>Inference Engine Settings</DialogTitle>
        <ModalClose variant="plain" sx={{ m: 1 }} />

        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const formObject = Object.fromEntries(formData.entries());

            const engine = formData.get('inferenceEngine');

            if (!engine) {
              closeModal();
              return;
            }

            const engineFriendlyName = document.querySelector(
              `button[name='inferenceEngine']`
            )?.innerHTML;

            const experimentId = experimentInfo?.id;

            const newInferenceSettings = {
              ...inferenceSettings,
              ...formObject,
              inferenceEngine: engine,
              inferenceEngineFriendlyName: engineFriendlyName,
            };

            setInferenceSettings(newInferenceSettings);

            await fetch(
              chatAPI.Endpoints.Experiment.UpdateConfig(
                experimentId,
                'inferenceParams',
                JSON.stringify(newInferenceSettings)
              )
            );

            closeModal();
          }}
        >
          <Stack spacing={0}>
            <FormControl>
              <FormLabel>Engine</FormLabel>
              <EngineSelect
                experimentInfo={experimentInfo}
                inferenceSettings={inferenceSettings}
                setSelectedPlugin={setSelectedPlugin}
                showUnsupported={showUnsupported}
                setShowUnsupported={setShowUnsupported}
              />
            </FormControl>

            <Typography level="title-md" paddingTop={2}>
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
