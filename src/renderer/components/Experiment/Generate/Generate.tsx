import { useState } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import Sheet from '@mui/joy/Sheet';
import {
  Alert,
  Button,
  CircularProgress,
  Divider,
  Table,
  Typography,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemDecorator,
  ListItemContent,
} from '@mui/joy';
import { ChevronRight, ChevronRightIcon, ClockIcon } from 'lucide-react';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Export({ experimentInfo }) {
  const [runningPlugin, setRunningPlugin] = useState(null);
  const [exportDetailsJobId, setExportDetailsJobId] = useState(-1);
  const [selectedPlugin, setSelectedPlugin] = useState(null);

  // call plugins list endpoint and filter based on type="exporter"
  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
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
  function isModelValidArchitecture(supported_architectures) {
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
      <Sheet
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Typography level="h2" sx={{ mb: 2 }}>
          Generators
        </Typography>
        <Sheet variant="soft" sx={{ p: 1, mb: 2 }}>
          <List>
            {[1, 2, 3].map((item) => (
              <ListItem>
                <ListItemButton>
                  <ListItemContent>Plugin #{item}</ListItemContent>
                  <ChevronRightIcon />
                </ListItemButton>
              </ListItem>
            ))}
          </List>{' '}
        </Sheet>
        <Typography level="h2" sx={{ mb: 2 }}>
          Output
        </Typography>
        <Sheet
          sx={{
            display: 'flex',
            flexDirection: 'row',
            overflowY: 'hidden',
            overflowX: 'hidden',
            mb: '2rem',
            height: '100%',
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <List>
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <ListItem>
                  <ListItemButton>
                    <ListItemContent>
                      Synthesize - Doc Generator - Jan 30: 5pm
                    </ListItemContent>
                    <ChevronRightIcon />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
          <Box sx={{ flex: 2 }}>
            <Sheet
              color="warning"
              variant="soft"
              sx={{
                px: 1,
                mt: 1,
                mb: 2,
                flex: 1,
                overflow: 'auto',
                height: '100%',
              }}
            >
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: '170px' }}>Time</th>
                    <th>Type</th>
                    <th style={{ width: '35%' }}>Output</th>
                    <th style={{ width: '120px' }}>Status</th>
                    <th style={{ width: '90px' }}></th>
                  </tr>
                </thead>
                <tbody style={{ overflow: 'auto', height: '100%' }}>
                  {exportJobs?.map((job) => {
                    return (
                      <tr key={job.id}>
                        <td>{job.created_at}</td>
                        <td>{job.job_data.exporter_name}</td>
                        <td>{job.job_data.output_model_name}</td>
                        <td>{job.status}</td>
                        <td
                          style={{
                            display: 'flex',
                            gap: 2,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                          }}
                        >
                          {' '}
                          <Button
                            size="sm"
                            disabled={
                              !(
                                job.status === 'COMPLETE' ||
                                job.status === 'FAILED'
                              )
                            }
                            onClick={() => {
                              setExportDetailsJobId(job.id);
                            }}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Sheet>
          </Box>
        </Sheet>
      </Sheet>
    </>
  );
}
