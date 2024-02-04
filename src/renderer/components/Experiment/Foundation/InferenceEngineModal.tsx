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
} from '@mui/joy';
import React, { useState } from 'react';
import DynamicPluginForm from '../Train/DynamicPluginForm';
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
      defaultValue={inferenceSettings?.inferenceEngine}
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

  return (
    <Modal open={showModal} onClose={() => setShowModal(false)}>
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
            const experimentId = experimentInfo?.id;

            setInferenceSettings({
              ...inferenceSettings,
              ...formObject,
              inferenceEngine: engine,
            });

            await fetch(
              chatAPI.Endpoints.Experiment.UpdateConfig(
                experimentId,
                'inferenceParams',
                JSON.stringify({
                  ...inferenceSettings,
                  ...formObject,
                  inferenceEngine: engine,
                })
              )
            );
            setShowModal(false);
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
