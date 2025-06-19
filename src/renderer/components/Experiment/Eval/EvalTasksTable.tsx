import React, { ReactElement, useState } from 'react';
import {
  Alert,
  Button,
  ButtonGroup,
  Dropdown,
  IconButton,
  ListDivider,
  MenuButton,
  MenuItem,
  Menu,
  Stack,
  Table,
  Typography,
  Sheet,
  ListItemDecorator,
  Divider,
  Box,
} from '@mui/joy';
import {
  FileTextIcon,
  PlayIcon,
  PlusCircleIcon,
  Trash2Icon,
  ChevronDownIcon,
  ServerIcon,
} from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { useAnalytics } from 'renderer/components/Shared/useAnalytics';
import EvalModal from './EvalModal';

const fetcher = (url) => fetch(url).then((res) => res.json());

interface Machine {
  id: number;
  name: string;
}

interface EvalRunButtonProps {
  evaluationId: string;
  pluginName: string;
  experimentId: number;
  machines?: Machine[];
  onTaskQueued?: () => void;
}

function EvalRunButton({
  evaluationId,
  pluginName,
  experimentId,
  machines = [],
  onTaskQueued,
}: EvalRunButtonProps) {
  const analytics: any = useAnalytics();

  const handleRunOnMachine = async (machineId: number) => {
    analytics.track('Task Queued Remote', {
      task_type: 'EVAL',
      plugin_name: pluginName,
      machine_id: machineId,
      experiment_id: experimentId,
    });
    await fetch(
      chatAPI.Endpoints.Tasks.QueueRemote(evaluationId, machineId),
    );
    onTaskQueued?.();
  };

  return machines.length > 0 ? (
    <ButtonGroup variant="soft">
      {/* Main Run Button */}
      <Button
        startDecorator={<PlayIcon />}
        variant="soft"
        color="success"
        onClick={async () => {
          analytics.track('Task Queued', {
            task_type: 'EVAL',
            plugin_name: pluginName,
            experiment_id: experimentId,
          });
          await fetch(chatAPI.Endpoints.Tasks.Queue(evaluationId));
          onTaskQueued?.();
        }}
        sx={{
          px: 2,
          py: 1,
          fontWeight: 'md',
          fontSize: 'sm',
          minHeight: '36px',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: 'lg',
          },
          '&:active': {
            transform: 'translateY(0px)',
          },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        Queue
      </Button>

      {/* Dropdown Button */}
      <Dropdown>
        <MenuButton
          slots={{ root: Button }}
          slotProps={{
            root: {
              variant: 'soft',
              color: 'success',
              sx: {
                px: 1,
                py: 1,
                minWidth: '32px',
                width: '32px',
                minHeight: '36px',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: 'lg',
                },
                '&:active': {
                  transform: 'translateY(0px)',
                },
                transition: 'all 0.2s ease-in-out',
              },
              'aria-label': 'Select machine to run on',
            },
          }}
        >
          <ChevronDownIcon size="12px" />
        </MenuButton>
        <Menu
          placement="bottom-end"
          sx={{
            mt: 0.5,
            minWidth: '240px',
            boxShadow: 'xl',
            border: '1px solid',
            borderColor: 'neutral.200',
            borderRadius: 'lg',
            p: 1,
          }}
        >
          <Box sx={{ px: 1, py: 0.5 }}>
            <Typography
              level="body-xs"
              sx={{
                color: 'neutral.600',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                letterSpacing: '0.05em',
                mb: 1,
              }}
            >
              🖥️ Run on Remote Machine
            </Typography>
            <Divider sx={{ my: 1 }} />
            {machines.map((machine) => (
              <MenuItem
                key={machine.id}
                onClick={() => handleRunOnMachine(machine.id)}
                sx={{
                  borderRadius: 'md',
                  my: 0.5,
                  px: 2,
                  py: 1.5,
                  background: 'transparent',
                  '&:hover': {
                    backgroundColor: 'success.50',
                    transform: 'translateX(4px)',
                    boxShadow: 'sm',
                  },
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                }}
              >
                <ListItemDecorator>
                  <Box
                    sx={{
                      p: 0.5,
                      borderRadius: 'sm',
                      backgroundColor: 'success.100',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ServerIcon
                      size="16px"
                      color="var(--joy-palette-success-600)"
                    />
                  </Box>
                </ListItemDecorator>
                <Box sx={{ ml: 1 }}>
                  <Typography
                    level="body-sm"
                    fontWeight="600"
                    sx={{ color: 'neutral.800' }}
                  >
                    {machine.name}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                    Machine ID: {machine.id}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Box>
        </Menu>
      </Dropdown>
    </ButtonGroup>
  ) : (
    /* Single symmetric button when no machines available */
    <Button
      startDecorator={<PlayIcon />}
      variant="soft"
      color="success"
      onClick={async () => {
        analytics.track('Task Queued', {
          task_type: 'EVAL',
          plugin_name: pluginName,
          experiment_id: experimentId,
        });
        await fetch(chatAPI.Endpoints.Tasks.Queue(evaluationId));
        onTaskQueued?.();
      }}
      sx={{
        px: 3,
        py: 1,
        fontWeight: 'md',
        fontSize: 'sm',
        minHeight: '36px',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: 'lg',
        },
        '&:active': {
          transform: 'translateY(0px)',
        },
        transition: 'all 0.2s ease-in-out',
      }}
    >
      Queue
    </Button>
  );
}

function formatTemplateConfig(script_parameters): ReactElement {
  // const c = JSON.parse(script_parameters);

  // Remove the author/full path from the model name for cleanliness
  // const short_model_name = c.model_name.split('/').pop();
  // Set main_task as either or the metric name from the script parameters
  const main_task = (() => {
    let predefined_tasks = script_parameters.predefined_tasks
      ? script_parameters.predefined_tasks
      : '';
    if (script_parameters.tasks) {
      try {
        const tasksArray = JSON.parse(script_parameters.tasks);
        if (Array.isArray(tasksArray)) {
          if (predefined_tasks && predefined_tasks !== '') {
            // Check if tasks array is empty
            if (tasksArray.length === 0) {
              // If tasks array is empty, return only the predefined tasks
              return predefined_tasks;
            }
            // If tasks array is not empty, join the tasks with the predefined tasks
            // and return the result
            return (
              tasksArray.map((task) => task.name).join(', ') +
              ',' +
              predefined_tasks
            );
          }
          // If predefined_tasks is empty, just return the tasks
          return tasksArray.map((task) => task.name).join(', ');
        }
      } catch (error) {
        // Invalid JSON; fall back to the original value
      }
      return script_parameters.tasks + predefined_tasks;
    }
    return script_parameters.tasks + predefined_tasks;
  })();
  const dataset_name = script_parameters.dataset_name
    ? script_parameters.dataset_name
    : 'N/A';
  const judge_model = script_parameters.judge_model
    ? script_parameters.judge_model
    : 'N/A';
  const is_model = judge_model !== 'N/A';
  const is_dataset = dataset_name !== 'N/A';

  const r = (
    <>
      <b>Metrics/Tasks:</b> {main_task} <br />
      {is_dataset && (
        <>
          <b>Dataset:</b> {dataset_name} <FileTextIcon size={14} />
          <br />
        </>
      )}
      {is_model && (
        <>
          <b>Model:</b> {judge_model}
          <br />
        </>
      )}
    </>
  );
  return r;
}


export default function EvalTasksTable({ experimentInfo }) {
  const [open, setOpen] = useState(false);
  const [currentPlugin, setCurrentPlugin] = useState('');
  const [currentEvalId, setCurrentEvalId] = useState('');

  const { data: tasks, mutate: mutateTasks } = useSWR(
    chatAPI.Endpoints.Tasks.ListByTypeInExperiment('EVAL', experimentInfo?.id),
    fetcher,
  );

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

  // Fetch available machines for remote execution
  const { data: machinesData } = useAPI('network', ['machines']);
  const machines = machinesData?.data || [];

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

  function openModalForPLugin(pluginId) {
    setCurrentPlugin(pluginId);
    setOpen(true);
  }

  return (
    <>
      <Stack
        direction="row"
        spacing={2}
        mb={2}
        justifyContent="space-between"
        alignItems="flex-end"
      >
        {' '}
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
        <Table aria-label="basic table" stickyHeader sx={{}}>
          <thead>
            <tr>
              <th width="200px" style={{ paddingLeft: '1rem' }}>
                Name
              </th>
              <th>Tasks</th>
              <th>Plugin</th>
              <th style={{ textAlign: 'right' }}>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(tasks) &&
              tasks.map((evaluations) => (
                <tr key={evaluations.id}>
                  <td style={{ overflow: 'hidden', paddingLeft: '1rem' }}>
                    {evaluations.name}
                  </td>
                  <td style={{ overflow: 'hidden' }}>
                    {formatTemplateConfig(JSON.parse(evaluations.config))}
                    {/* {evaluations?.script_parameters?.task}&nbsp; */}
                    {/* <FileTextIcon size={14} /> */}
                  </td>
                  <td>{evaluations.plugin}</td>
                  <td style={{ textAlign: 'right' }}>
                    <ButtonGroup
                      variant="soft"
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      <EvalRunButton
                        evaluationId={evaluations.id}
                        pluginName={evaluations.plugin}
                        experimentId={experimentInfo?.id}
                        machines={machines}
                        onTaskQueued={mutateTasks}
                      />
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setOpen(true);
                          setCurrentPlugin(evaluations?.plugin);
                          setCurrentEvalId(evaluations.id);
                        }}
                      >
                        Edit
                      </Button>
                      <IconButton
                        onClick={async () => {
                          await fetch(
                            chatAPI.Endpoints.Tasks.DeleteTask(evaluations.id),
                          );
                          mutateTasks();
                        }}
                      >
                        <Trash2Icon />
                      </IconButton>
                    </ButtonGroup>
                  </td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Sheet>
    </>
  );
}
