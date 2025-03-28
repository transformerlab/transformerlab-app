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
  ListDivider,
} from '@mui/joy';
import { PlusCircleIcon } from 'lucide-react';

import EvalJobsTable from './EvalJobsTable.tsx';
import EvalTasksTable from './EvalTasksTable';
// import NewEvalModal from './NewEvalModal';
import EvalModal from './EvalModal';

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

export default function Eval({
  experimentInfo,
  addEvaluation,
  experimentInfoMutate,
}) {
  const [open, setOpen] = useState(false);
  const [currentEvaluator, setCurrentEvaluator] = useState('');
  const [currentPlugin, setCurrentPlugin] = useState('');
  const [currentEvalId, setCurrentEvalId] = useState('');

  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'evaluator',
      ),
    fetcher,
  );

  const { data: tasks, mutate: mutateTasks } = useSWR(
    chatAPI.Endpoints.Tasks.ListByTypeInExperiment('EVAL', experimentInfo?.id),
    fetcher,
  );

  async function saveFile() {
    // const value = editorRef?.current?.getValue();

    if (value) {
      // Use fetch to post the value to the server
      await fetch(
        chatAPI.Endpoints.Experiment.SavePlugin(project, evalName, 'main.py'),
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

  // eslint-disable-next-line react/no-unstable-nested-components
  function FilteredPlugins({ plugins, type }) {
    const filteredPlugins = plugins?.filter((row) => row.evalsType === type);
    if (!filteredPlugins || filteredPlugins.length === 0) {
      return <MenuItem disabled>No plugins installed</MenuItem>;
    }

    return filteredPlugins.map((row) => (
      <MenuItem
        onClick={() => openModalForPLugin(row.uniqueId)}
        key={row.uniqueId}
      >
        {row.name}
      </MenuItem>
    ));
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
      <EvalModal
        open={open}
        onClose={() => {
          setOpen(false);
          setCurrentEvalId('');
        }}
        experimentInfo={experimentInfo}
        mutateTasks={mutateTasks}
        pluginId={currentPlugin}
        currentEvalId={currentEvalId}
      />
      <Stack
        direction="row"
        spacing={2}
        mb={2}
        justifyContent="space-between"
        alignItems="flex-end"
      >
        <Typography level="h3" mb={1}>
          Evaluation Tasks
        </Typography>
        {plugins?.length === 0 ? (
          <Alert color="danger">
            No Evaluation Scripts available, please install an evaluator plugin.
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
              {/* Model-based evaluators section */}
              <MenuItem
                disabled
                sx={{
                  color: 'text.tertiary',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                  '&.Mui-disabled': { opacity: 1 },
                }}
              >
                DATASET-BASED EVALUATIONS
              </MenuItem>

              <FilteredPlugins plugins={plugins} type="dataset" />

              <ListDivider />

              {/* Dataset-based evaluators section */}
              <MenuItem
                disabled
                sx={{
                  color: 'text.tertiary',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                  '&.Mui-disabled': { opacity: 1 },
                }}
              >
                MODEL-BASED EVALUATIONS
              </MenuItem>
              <FilteredPlugins plugins={plugins} type="model" />
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
        {/* Plugins:
        {JSON.stringify(plugins)} */}
        <EvalModal
          open={open}
          onClose={() => {
            setOpen(false);
            setCurrentEvalId('');
          }}
          experimentInfo={experimentInfo}
          mutateTasks={mutateTasks}
          pluginId={currentPlugin}
          currentEvalId={currentEvalId}
        />
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
          <EvalTasksTable
            experimentInfo={experimentInfo}
            experimentInfoMutate={experimentInfoMutate}
            setCurrentPlugin={setCurrentPlugin}
            setCurrentEvalId={setCurrentEvalId}
            setOpen={setOpen}
            tasks={tasks}
            mutateTasks={mutateTasks}
          />
        </Sheet>
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
        <EvalJobsTable />
      </Sheet>
    </Sheet>
  );
}
