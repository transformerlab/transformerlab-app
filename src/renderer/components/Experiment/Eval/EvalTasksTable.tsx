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
} from '@mui/joy';
import { ReactElement, useState } from 'react';
import {
  FileTextIcon,
  PlayIcon,
  PlusCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { useAnalytics } from 'renderer/components/Shared/analytics/AnalyticsContext';
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';
import EvalModal from './EvalModal';

const fetcher = (url) => fetch(url).then((res) => res.json());

function formatTemplateConfig(script_parameters): ReactElement {
  // Safety check for valid input
  if (!script_parameters || typeof script_parameters !== 'object') {
    return <span>No configuration available</span>;
  }

  // const c = JSON.parse(script_parameters);

  // Remove the author/full path from the model name for cleanliness
  // const short_model_name = c.model_name.split('/').pop();
  // Set main_task as either or the metric name from the script parameters
  const main_task = (() => {
    let predefined_tasks = script_parameters.predefined_tasks
      ? script_parameters.predefined_tasks
      : '';
    if (script_parameters.tasks) {
      // Check if tasks is a string (comma-separated values)
      if (typeof script_parameters.tasks === 'string') {
        // Try to parse as JSON first
        try {
          const tasksArray = SafeJSONParse(script_parameters.tasks, '');
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
          // Not valid JSON, treat as comma-separated string
        }
        // Handle as comma-separated string
        const taskString = script_parameters.tasks.trim();
        if (predefined_tasks && predefined_tasks !== '') {
          return taskString + ',' + predefined_tasks;
        }
        return taskString;
      }

      // If tasks is an array, handle it properly
      if (Array.isArray(script_parameters.tasks)) {
        let taskNames: string;

        // Check if it's an array of strings or objects with name field
        if (script_parameters.tasks.length > 0) {
          if (typeof script_parameters.tasks[0] === 'string') {
            // Array of strings
            taskNames = script_parameters.tasks.join(', ');
          } else if (script_parameters.tasks[0]?.name) {
            // Array of objects with name field
            taskNames = script_parameters.tasks
              .map((task: any) => task.name)
              .join(', ');
          } else {
            // Fallback for other object structures
            taskNames = script_parameters.tasks.join(', ');
          }
        } else {
          // Empty array
          taskNames = '';
        }

        if (predefined_tasks && predefined_tasks !== '') {
          // If tasks array is empty, return only predefined tasks
          if (taskNames === '') {
            return predefined_tasks;
          }
          // Join with predefined tasks
          return taskNames + ',' + predefined_tasks;
        }
        return taskNames;
      }

      // If tasks is not a string or array, fall back to original behavior
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

async function evaluationRun(taskId: string) {
  // fetch(
  //   chatAPI.Endpoints.Experiment.RunEvaluation(experimentId, plugin, evaluator)
  // );
  await fetch(chatAPI.Endpoints.Tasks.Queue(taskId));
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

  const analytics = useAnalytics();
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
                    {formatTemplateConfig(
                      SafeJSONParse(evaluations.config, {}),
                    )}
                    {/* {evaluations?.script_parameters?.task}&nbsp; */}
                    {/* <FileTextIcon size={14} /> */}
                  </td>
                  <td>{evaluations.plugin}</td>
                  <td style={{ textAlign: 'right' }}>
                    <ButtonGroup
                      variant="soft"
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      <Button
                        startDecorator={<PlayIcon />}
                        variant="soft"
                        color="success"
                        onClick={async () => {
                          // Track the event with analytics
                          analytics.track('Task Queued', {
                            task_type: 'EVAL',
                            plugin_name: evaluations.plugin,
                          });
                          evaluationRun(evaluations.id);
                        }}
                      >
                        Queue
                      </Button>
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
