import {
  Alert,
  Button,
  ButtonGroup,
  Dropdown,
  IconButton,
  ListItemDecorator,
  MenuButton,
  MenuItem,
  Menu,
  Stack,
  Table,
  Typography,
  Sheet,
  Box,
} from '@mui/joy';
import { ReactElement, useState } from 'react';
import { PlayIcon, PlusCircleIcon, Trash2Icon, Plug2Icon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { useAnalytics } from 'renderer/components/Shared/analytics/AnalyticsContext';
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';
import ExportModal from './ExportModal';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatExportConfig(config: any): ReactElement {
  // Safety check for valid input
  if (!config || typeof config !== 'object') {
    return <span>No configuration available</span>;
  }

  const pluginName = config.plugin_name || 'N/A';
  const outputModelArchitecture = config.output_model_architecture || 'N/A';
  const params = config.params || {};

  // Extract quantization info if available
  let quantization = '';
  if (params.outtype) {
    quantization = params.outtype;
  } else if (params.q_bits) {
    quantization = `${params.q_bits}bit`;
  }

  return (
    <>
      <b>Format:</b> {outputModelArchitecture} <br />
      <b>Plugin:</b> {pluginName} <br />
      {quantization && (
        <>
          <b>Quantization:</b> {quantization} <br />
        </>
      )}
    </>
  );
}

// returns true if the currently loaded foundation is in the passed array
// supportedArchitectures - a list of all architectures supported by this plugin
function isModelValidArchitecture(
  supportedArchitectures: string[],
  experimentInfo: any,
): boolean {
  return (
    experimentInfo != null &&
    experimentInfo?.config?.foundation !== '' &&
    supportedArchitectures.includes(
      experimentInfo?.config?.foundation_model_architecture,
    )
  );
}

async function exportRun(taskId: string) {
  await fetch(chatAPI.Endpoints.Tasks.Queue(taskId));
}

export default function ExportTasksTable({
  experimentInfo,
}: {
  experimentInfo: any;
}) {
  const [open, setOpen] = useState(false);
  const [currentPlugin, setCurrentPlugin] = useState('');
  const [currentExportId, setCurrentExportId] = useState('');

  const { data: tasks, mutate: mutateTasks } = useSWR(
    chatAPI.Endpoints.Tasks.ListByTypeInExperiment(
      'EXPORT',
      experimentInfo?.id,
    ),
    fetcher,
  );

  const { data: plugins } = useSWR(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'exporter',
      ),
    fetcher,
  );

  const analytics = useAnalytics();

  function openModalForPlugin(pluginId: string) {
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
        <ExportModal
          open={open}
          onClose={() => {
            setOpen(false);
            setCurrentExportId('');
          }}
          experimentInfo={experimentInfo}
          mutateTasks={mutateTasks}
          pluginId={currentPlugin}
          currentExportId={currentExportId}
        />
        <Typography level="h3" mb={1}>
          Export Tasks
        </Typography>
        {plugins?.length === 0 ? (
          <Alert color="danger">
            No Export Plugins available, please install an exporter plugin.
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
              Add Export Task
            </MenuButton>
            <Menu sx={{ maxWidth: '300px' }}>
              <MenuItem disabled variant="soft" color="primary">
                <Typography level="title-sm">
                  Select an export plugin from the following list:
                </Typography>
              </MenuItem>
              <Box sx={{ maxHeight: 300, overflowY: 'auto', width: '100%' }}>
                {plugins?.map((plugin: any) => {
                  const isCompatible = isModelValidArchitecture(
                    plugin.model_architectures,
                    experimentInfo,
                  );
                  return (
                    <MenuItem
                      onClick={() => openModalForPlugin(plugin.uniqueId)}
                      key={plugin.uniqueId}
                      disabled={!isCompatible}
                    >
                      <ListItemDecorator>
                        <Plug2Icon />
                      </ListItemDecorator>
                      <div>
                        {plugin.name}
                        <Typography
                          level="body-xs"
                          sx={{ color: 'var(--joy-palette-neutral-400)' }}
                        >
                          {!isCompatible
                            ? '(Does not support this model architecture)'
                            : ''}
                        </Typography>
                      </div>
                    </MenuItem>
                  );
                })}
              </Box>
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
        <Table aria-label="basic table" stickyHeader>
          <thead>
            <tr>
              <th style={{ width: '200px', paddingLeft: '1rem' }}>Name</th>
              <th>Configuration</th>
              <th>Plugin</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(tasks) &&
              tasks.map((task: any) => (
                <tr key={task.id}>
                  <td style={{ overflow: 'hidden', paddingLeft: '1rem' }}>
                    {task.name}
                  </td>
                  <td style={{ overflow: 'hidden' }}>
                    {formatExportConfig(SafeJSONParse(task.config, {}))}
                  </td>
                  <td>{task.plugin}</td>
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
                            task_type: 'EXPORT',
                            plugin_name: task.plugin,
                          });
                          exportRun(task.id);
                        }}
                      >
                        Queue
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setOpen(true);
                          setCurrentPlugin(task?.plugin);
                          setCurrentExportId(task.id);
                        }}
                      >
                        Edit
                      </Button>
                      <IconButton
                        onClick={async () => {
                          await fetch(
                            chatAPI.Endpoints.Tasks.DeleteTask(task.id),
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
