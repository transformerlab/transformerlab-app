import { useState } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import ExportDetailsModal from './ExportDetailsModal';
import PluginSettingsModal from './PluginSettingsModal';
import ExportJobsTable from './ExportJobsTable';
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';

import Sheet from '@mui/joy/Sheet';
import {
  Alert,
  Button,
  CircularProgress,
  Divider,
  Table,
  Typography,
} from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

// fetcher used by SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Plugin {
  uniqueId: string;
  name: string;
  description: string;
  model_architectures: string[];
}

export default function Export() {
  const { experimentInfo } = useExperimentInfo();
  const [runningPlugin, setRunningPlugin] = useState<string | null>(null);
  const [exportDetailsJobId, setExportDetailsJobId] = useState<number>(-1);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);

  // call plugins list endpoint and filter based on type="exporter"
  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR<Plugin[]>(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'exporter',
      ),
    fetcher,
  );

  // returns true if the currently loaded foundation is in the passed array
  // supported_architectures - a list of all architectures supported by this plugin
  function isModelValidArchitecture(
    supported_architectures: string[],
  ): boolean {
    return (
      experimentInfo != null &&
      experimentInfo?.config?.foundation !== '' &&
      supported_architectures.includes(
        experimentInfo?.config?.foundation_model_architecture,
      )
    );
  }

  // This function is passed to PluginSettingsModal
  // It allows it to run an exporter plugin on the current experiment's model
  async function exportRun(
    plugin_id: string,
    plugin_architecture: string,
    params_json: string,
  ) {
    if (plugin_id) {
      // Convert snake_case parameters to camelCase for consistent code style
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const pluginId = plugin_id;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const pluginArchitecture = plugin_architecture;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const paramsJson = params_json;

      // sets the running plugin ID, which is used by the UI to set disabled on buttons
      setRunningPlugin(pluginId);

      try {
        // Step 1: Get experiment data
        const expResponse = await fetch(
          chatAPI.Endpoints.Experiment.Get(experimentInfo?.id),
        );
        const experiment = await expResponse.json();
        const config = SafeJSONParse(experiment.config, {} as any);

        // Step 2: Build task payload
        const inputModelId = config.foundation;
        const inputModelIdWithoutAuthor = inputModelId.split('/').pop();
        const conversionTime = Math.floor(Date.now() / 1000);

        // Parse plugin parameters
        const pluginParams = SafeJSONParse(paramsJson, {} as any);

        let qType = '';
        if (pluginParams.outtype) qType = pluginParams.outtype;
        else if (pluginParams.q_bits) qType = `${pluginParams.q_bits}bit`;

        let outputModelId = `${pluginArchitecture}-${inputModelIdWithoutAuthor}-${conversionTime}`;
        if (qType) outputModelId += `-${qType}`;

        if (pluginArchitecture === 'GGUF') {
          outputModelId = `${inputModelIdWithoutAuthor}-${conversionTime}${qType ? `-${qType}` : ''}.gguf`;
        }

        const taskPayload = {
          name: `Export ${inputModelIdWithoutAuthor} to ${pluginArchitecture}`,
          type: 'EXPORT',
          inputs: JSON.stringify({
            input_model_id: inputModelId,
            input_model_path: config.foundation_filename || inputModelId,
            input_model_architecture: config.foundation_model_architecture,
            plugin_name: pluginId,
            plugin_architecture: pluginArchitecture,
          }),
          config: JSON.stringify({
            plugin_name: pluginId,
            input_model_id: inputModelId,
            input_model_path: config.foundation_filename || inputModelId,
            input_model_architecture: config.foundation_model_architecture,
            output_model_id: outputModelId,
            output_model_architecture: pluginArchitecture,
            output_model_name: `${inputModelIdWithoutAuthor} - ${pluginArchitecture}${qType ? ` - ${qType}` : ''}`,
            output_model_path: `/models/${outputModelId}`,
            output_filename: pluginArchitecture === 'GGUF' ? outputModelId : '',
            script_directory: `/plugins/${pluginId}`,
            params: pluginParams,
          }),
          plugin: pluginId,
          outputs: JSON.stringify({
            exported_model_path: `/models/${outputModelId}`,
            output_model_id: outputModelId,
            export_status: 'pending',
          }),
          experiment_id: experimentInfo?.id,
        };

        // Step 3: Create task
        const createResponse = await fetch(chatAPI.Endpoints.Tasks.NewTask(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskPayload),
        });

        if (!createResponse.ok) throw new Error('Failed to create task');

        console.log('Task created successfully', await createResponse.json());

        // Step 4: Get task ID and queue it
        const tasksResponse = await fetch(
          chatAPI.Endpoints.Tasks.ListByTypeInExperiment(
            'EXPORT',
            experimentInfo?.id,
          ),
        );

        const tasks = await tasksResponse.json();

        // Find the task with the latest/highest ID (most recently created)
        const latestTask = tasks.reduce((latest: any, current: any) => {
          return current.id > latest.id ? current : latest;
        });
        const taskId = latestTask.id;

        const queueResponse = await fetch(
          chatAPI.Endpoints.Tasks.Queue(taskId),
        );
        if (!queueResponse.ok) {
          console.log('Failed to queue task', await queueResponse.json());
          throw new Error('Failed to queue task');
        }
      } catch (error) {
        // Error handling for task creation and queueing
        // eslint-disable-next-line no-console
        console.error('Error creating and queueing export task:', error);
      } finally {
        // Clean up after export by unsetting running plugin (re-enables buttons)
        setRunningPlugin(null);
      }
    }
  }

  return (
    <>
      <ExportDetailsModal
        jobId={exportDetailsJobId}
        setJobId={setExportDetailsJobId}
      />

      <PluginSettingsModal
        onClose={() => {
          // unselect active plugin and close modal
          setSelectedPlugin(null);
        }}
        onSubmit={exportRun}
        experimentInfo={experimentInfo}
        plugin={selectedPlugin}
      />

      <Sheet
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Typography level="h3" mb={1}>
          Export Model
        </Typography>
        <Sheet sx={{ overflowY: 'auto', overflowX: 'hidden', mb: '2rem' }}>
          <Divider sx={{ mt: 2, mb: 2 }} />
          <Typography level="title-lg" mb={2}>
            Available Export Formats&nbsp;
          </Typography>
          {plugins?.length === 0 ? (
            <Alert color="danger">
              No Export Formats available, please install an export plugin.
            </Alert>
          ) : (
            <Table aria-label="basic table">
              <thead>
                <tr>
                  <th>Exporter</th>
                  <th style={{ width: '50%' }}>Description</th>
                  <th style={{ textAlign: 'right' }}>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {plugins?.map((row: Plugin) => (
                  <tr key={row.uniqueId}>
                    <td>{row.name}</td>
                    <td>{row.description}</td>
                    <td style={{ textAlign: 'right' }}>
                      {' '}
                      <Button
                        startDecorator={
                          runningPlugin === row.uniqueId ? (
                            <CircularProgress size="sm" thickness={2} />
                          ) : !isModelValidArchitecture(
                              row.model_architectures,
                            ) ? (
                            ' '
                          ) : (
                            ''
                          )
                        }
                        color="success"
                        variant="soft"
                        onClick={async () => {
                          // set the selected plugin which will open the PluginSettingsModal
                          setSelectedPlugin(row);
                        }}
                        disabled={
                          !isModelValidArchitecture(row.model_architectures) ||
                          runningPlugin !== null
                        }
                      >
                        {runningPlugin === row.uniqueId
                          ? 'Exporting...'
                          : !isModelValidArchitecture(row.model_architectures)
                            ? 'Not supported for this model architecture'
                            : 'Select'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Sheet>

        <Sheet sx={{ px: 1, mt: 1, mb: 2, flex: 1, overflow: 'auto' }}>
          <ExportJobsTable />
        </Sheet>
      </Sheet>
    </>
  );
}
