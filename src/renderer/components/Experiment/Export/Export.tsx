import {useState} from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import ExportDetailsModal from './ExportDetailsModal';
import PluginSettingsModal from './PluginSettingsModal';
import ExportJobsTable from './ExportJobsTable';

import Sheet from '@mui/joy/Sheet';
import {
  Alert,
  Button,
  CircularProgress,
  Divider,
  Table,
  Typography,
} from '@mui/joy';

// fetcher used by SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ExportProps {
  experimentInfo: any;
}

interface Plugin {
  uniqueId: string;
  name: string;
  description: string;
  model_architectures: string[];
}

export default function Export({ experimentInfo }: ExportProps) {
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
        'exporter'
      ),
    fetcher
  );

  const {
    data: exportJobs,
    error: exportJobsError,
    isLoading: exportJobsIsLoading,
    mutate: exportJobsMutate,
  } = useSWR(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.GetExportJobs(experimentInfo?.id),
    fetcher,
    {
      refreshInterval: 2000,
    }
  );

  // returns true if the currently loaded foundation is in the passed array
  // supported_architectures - a list of all architectures supported by this plugin
  function isModelValidArchitecture(supported_architectures: string[]): boolean {
    return (
      experimentInfo != null &&
      experimentInfo?.config?.foundation !== '' &&
      supported_architectures.includes(
        experimentInfo?.config?.foundation_model_architecture
      )
    );
  }

  // This function is passed to PluginSettingsModal
  // It allows it to run an exporter plugin on the current experiment's model
  async function exportRun(
    plugin_id: string,
    plugin_architecture: string,
    params_json: string
  ) {
    if (plugin_id) {
      // sets the running plugin ID, which is used by the UI to set disabled on buttons
      setRunningPlugin(plugin_id);

      // Call the export job and since this is running async we'll await
      const response = await fetch(
        chatAPI.Endpoints.Experiment.RunExport(
          experimentInfo?.id,
          plugin_id,
          plugin_architecture,
          params_json
        )
      );

      // Clean up after export by unsetting running plugin (re-enables buttons)
      setRunningPlugin(null);
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
        <Typography level="h3" mb={1}>Export Model</Typography>
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
                              row.model_architectures
                            ) ? (
                            ' '
                          ) : (
                            ''
                          )
                        }
                        color="success"
                        variant="soft"
                        onClick={async (e) => {
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

        <Sheet
          sx={{ px: 1, mt: 1, mb: 2, flex: 1, overflow: 'auto' }}
        >
          <ExportJobsTable experimentInfo={experimentInfo} />
        </Sheet>
      </Sheet>
    </>
  );
}
