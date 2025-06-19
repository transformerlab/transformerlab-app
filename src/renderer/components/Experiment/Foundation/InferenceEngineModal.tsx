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
import React, { useState } from 'react';
import DynamicPluginForm from '../DynamicPluginForm';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

function EngineSelect({
  experimentInfo,
  inferenceSettings,
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
          defaultValue="Select Engine"
          onChange={(e, newValue) => {
            setSelectedPlugin(newValue);
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
  const [selectedPlugin, setSelectedPlugin] = useState(null);

  function closeModal() {
    setShowModal(false);
    setSelectedPlugin(inferenceSettings?.inferenceEngine);
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

            const engine = formData.get('inferenceEngine');

            if (!engine) {
              closeModal();
              return;
            }

            const engineFriendlyName = document.querySelector(
              `button[name='inferenceEngine']`,
            )?.innerHTML;

            const experimentId = experimentInfo?.id;

            // We do this if else condition here because we have leftover parameters which aren't accepted by another engine also getting sent when we switch engines.
            // So we need to reset the inference settings to only include the parameters for the selected engine;
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

            setInferenceSettings(newInferenceSettings);

            await fetch(
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
                experimentInfo={experimentInfo}
                inferenceSettings={inferenceSettings}
                setSelectedPlugin={setSelectedPlugin}
                supportedEngines={supportedEngines}
                unsupportedEngines={unsupportedEngines}
                isLoading={isLoading}
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
