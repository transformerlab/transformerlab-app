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
  showUnsupported,
  setShowUnsupported,
  supported,
  unsupported,
  isLoading,
}) {
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
          listboxSx={{ zIndex: 1400 }}
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
      </Box>
      <Checkbox
        checked={showUnsupported}
        onChange={(e) => setShowUnsupported(e.target.checked)}
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
  supported,
  unsupported,
  isLoading,
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
          minWidth: showUnsupported ? 350 : 350, // Adjusted width and height to prevent css issues.
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
              `button[name='inferenceEngine']`,
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
                showUnsupported={showUnsupported}
                setShowUnsupported={setShowUnsupported}
                supported={supported}
                unsupported={unsupported}
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
