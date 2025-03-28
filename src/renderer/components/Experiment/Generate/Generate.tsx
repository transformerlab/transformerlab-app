/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import Sheet from '@mui/joy/Sheet';

import {
  Typography,
  Option,
  Dropdown,
  MenuButton,
  Menu,
  MenuItem,
  Alert,
  Stack,
} from '@mui/joy';
import { PlusCircleIcon } from 'lucide-react';

import GenerateJobsTable from './GenerateJobsTable';
import GenerateTasksTable from './GenerateTasksTable';
import GenerateModal from './GenerateModal';

function getTemplateParametersForPlugin(pluginName, plugins) {
  if (!pluginName || !plugins) {
    return [];
  }

  const plugin = plugins.find((row) => row.name === pluginName);
  if (plugin) {
    return plugin?.info?.template_parameters[0]?.options.map((row) => (
      <Option value={row} key={row}>
        {row}
      </Option>
    ));
  }
  return [];
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Generate({
  experimentInfo,
  addGeneration,
  experimentInfoMutate,
}) {
  const [open, setOpen] = useState(false);
  const [currentPlugin, setCurrentPlugin] = useState('');
  const [currentGenerationId, setCurrentGenerationId] = useState('');

  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'generator',
      ),
    fetcher,
  );

  async function saveFile() {
    // const value = editorRef?.current?.getValue();

    if (value) {
      // Use fetch to post the value to the server
      await fetch(
        chatAPI.Endpoints.Experiment.SavePlugin(
          project,
          generationName,
          'main.py',
        ),
        {
          method: 'POST',
          body: value,
        },
      ).then(() => {});
    }
  }

  function openModalForPLugin(pluginId) {
    setCurrentPlugin(pluginId);
    setOpen(true);
  }

  if (!experimentInfo) {
    return 'No experiment selected';
  }

  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Plugins:
        {JSON.stringify(plugins)} */}
      <GenerateModal
        open={open}
        onClose={() => {
          setOpen(false);
          setCurrentGenerationId('');
        }}
        experimentInfo={experimentInfo}
        experimentInfoMutate={experimentInfoMutate}
        pluginId={currentPlugin}
        currentGenerationId={currentGenerationId}
      />
      <Stack
        direction="row"
        spacing={2}
        mb={2}
        justifyContent="space-between"
        alignItems="flex-end"
      >
        <Typography level="h3" mb={1}>
          Generation Tasks
        </Typography>
        {plugins?.length === 0 ? (
          <Alert color="danger">
            No Generator Scripts available, please install a generator plugin.
          </Alert>
        ) : (
          <Dropdown>
            <MenuButton
              startDecorator={<PlusCircleIcon />}
              variant="plain"
              color="success"
              sx={{ width: 'fit-content', mb: 1 }}
              size="sm"
            >
              Add Task
            </MenuButton>
            <Menu>
              {plugins?.map((row) => (
                <MenuItem
                  onClick={() => openModalForPLugin(row.uniqueId)}
                  key={row.uniqueId}
                >
                  {row.name}
                </MenuItem>
              ))}
            </Menu>
          </Dropdown>
        )}
      </Stack>
      <Sheet
        variant="soft"
        color="primary"
        sx={{
          overflow: 'auto',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <GenerateTasksTable
          experimentInfo={experimentInfo}
          experimentInfoMutate={experimentInfoMutate}
          setCurrentPlugin={setCurrentPlugin}
          setCurrentGenerationId={setCurrentGenerationId}
          setOpen={setOpen}
        />
      </Sheet>
      <Sheet
        sx={{
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          flex: 2,
          pt: 2,
        }}
      >
        <GenerateJobsTable />
      </Sheet>
    </Sheet>
  );
}
