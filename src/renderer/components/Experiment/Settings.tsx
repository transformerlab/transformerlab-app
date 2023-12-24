/* eslint-disable jsx-a11y/anchor-is-valid */
import useSWR from 'swr';

import Sheet from '@mui/joy/Sheet';
import {
  Button,
  Chip,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Select,
  Stack,
  Switch,
  Typography,
  Option,
  ChipDelete,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { PlusCircleIcon, XCircleIcon, XIcon } from 'lucide-react';
import { useState, FormEvent } from 'react';

const fetcher = (url) => fetch(url).then((res) => res.json());

function AddPluginToExperimentModal({
  open,
  setOpen,
  experimentInfo,
  experimentInfoMutate,
}) {
  const {
    data: pluginsData,
    error: pluginsIsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    chatAPI.Endpoints.Experiment.ListScripts(experimentInfo?.id),
    fetcher
  );

  if (!experimentInfo?.id) {
    return 'No experiment selected.';
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog sx={{ width: '30vw' }}>
        <DialogTitle>Add Plugin to {experimentInfo?.name}</DialogTitle>
        <form
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();

            const formData = new FormData(event.currentTarget);
            const pluginName = formData.get('plugin_name');

            const res = await fetch(
              chatAPI.Endpoints.Experiment.InstallPlugin(
                experimentInfo?.id,
                pluginName
              )
            );
            const data = await res.json();

            if (data?.error) {
              alert(data?.message);
              return;
            }

            experimentInfoMutate();

            setOpen(false);
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Select
                required
                placeholder="Select Script"
                variant="outlined"
                size="lg"
                name="plugin_name"
              >
                {pluginsData?.map((row) => (
                  <Option value={row?.uniqueId} key={row.uniqueId}>
                    {row.name}
                  </Option>
                ))}
              </Select>
            </FormControl>
            <Button type="submit">Add</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}

export default function ExperimentSettings({
  experimentInfo,
  setExperimentId,
  experimentInfoMutate,
}) {
  const [showJSON, setShowJSON] = useState(false);
  const [showPluginsModal, setShowPluginsModal] = useState(false);

  let plugins = experimentInfo?.config?.plugins;

  if (!experimentInfo) {
    return null;
  }
  return (
    <>
      <Typography level="h1">Experiment Settings</Typography>
      <Sheet>
        <Divider sx={{ mt: 2, mb: 2 }} />
        Show Experiment Details (JSON):&nbsp;
        <Switch checked={showJSON} onChange={() => setShowJSON(!showJSON)} />
        <pre
          style={{
            display: showJSON ? 'block' : 'none',
          }}
        >
          {JSON.stringify(experimentInfo, null, 2)}
        </pre>
        <Divider sx={{ mt: 2, mb: 2 }} />
        <Typography level="h2" mb={2}>
          Scripts&nbsp;
          <Button
            sx={{ justifySelf: 'center' }}
            variant="soft"
            startDecorator={<PlusCircleIcon />}
            onClick={() => setShowPluginsModal(true)}
          >
            Add Script
          </Button>
        </Typography>
        {plugins &&
          plugins.map((plugin) => (
            <>
              <Chip
                color="success"
                endDecorator={
                  <ChipDelete
                    onDelete={async () => {
                      await fetch(
                        chatAPI.Endpoints.Experiment.DeletePlugin(
                          experimentInfo?.id,
                          plugin
                        )
                      );
                      experimentInfoMutate();
                    }}
                  />
                }
                size="lg"
              >
                {plugin}
              </Chip>
              &nbsp;
            </>
          ))}
        <AddPluginToExperimentModal
          open={showPluginsModal}
          setOpen={setShowPluginsModal}
          experimentInfo={experimentInfo}
          experimentInfoMutate={experimentInfoMutate}
        />
        <Divider sx={{ mt: 2, mb: 2 }} />
        <Button
          color="danger"
          variant="outlined"
          onClick={() => {
            if (
              confirm(
                'Are you sure you want to delete this project? If you click on "OK" There is no way to recover it.'
              )
            ) {
              fetch(chatAPI.DELETE_EXPERIMENT_URL(experimentInfo?.id));
              setExperimentId(null);
            }
          }}
        >
          Delete Project {experimentInfo?.name}
        </Button>
      </Sheet>
    </>
  );
}
