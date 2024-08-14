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
  Switch,
  Button,
  Typography,
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
}) {
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
      defaultValue="Select Engine"
      onChange={(e, newValue) => {
        setSelectedPlugin(newValue);
      }}
    >
      {data?.map((row) => (
        <Option value={row.uniqueId} key={row.uniqueId}>
          {row.name}
        </Option>
      ))}
    </Select>
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

  // Call this on either cancel or save, but only after any changes are saved
  // It resets the selected plugin to whatever the saved experiment settings are (overwriting whatever the user selected)
  function closeModal() {
    setShowModal(false);
    setSelectedPlugin(inferenceSettings?.inferenceEngine);
  }

  return (
    <Modal open={showModal} onClose={closeModal}>
      <ModalDialog>
        <DialogTitle>Inference Engine Settings</DialogTitle>
        <ModalClose variant="plain" sx={{ m: 1 }} />

        {/* <DialogContent>Fill in the information of the project.</DialogContent> */}
        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const formObject = Object.fromEntries(formData.entries());

            const engine = formData.get('inferenceEngine');

            if (!engine) {
              closeModal();
            }

            // We don't want to go to the server to get the friendly name of the server
            // so we dig into the DOM to get it
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
            {/* {JSON.stringify(inferenceSettings)} */}
            <FormControl>
              <FormLabel>Engine</FormLabel>
              <EngineSelect
                experimentInfo={experimentInfo}
                inferenceSettings={inferenceSettings}
                setSelectedPlugin={setSelectedPlugin}
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
