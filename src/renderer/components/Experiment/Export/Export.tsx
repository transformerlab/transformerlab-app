import { useRef, useState } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import ExportDetailsModal from './ExportDetailsModal';

import Sheet from '@mui/joy/Sheet';
import { Button, CircularProgress, Divider, Table, Typography } from '@mui/joy';
import {
  ArrowRightFromLineIcon,
  ClockIcon,
} from 'lucide-react';

// run an exporter plugin on the current experiment's model 
function exportRun(
  experimentId: string,
  plugin: string
) {
  return fetch(
    chatAPI.Endpoints.Experiment.RunExport(experimentId, plugin)
  );
}

// fetcher used by SWR 
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Export({experimentInfo}) {

  const [jobId, setJobId] = useState(null);
  const [viewExportDetails, setViewExportDetails] = useState(-1);

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
      chatAPI.Endpoints.Experiment.GetExportJobs(
        experimentInfo?.id
      ), fetcher, {
    refreshInterval: 2000,
  });


  // returns true if the currently loaded foundation is in the passed array
  // supported_architectures - a list of all architectures supported by this plugin
  function isModelValidArchitecture(supported_architectures) {
    return experimentInfo != null && experimentInfo?.config?.foundation !== ''
          && supported_architectures.includes(experimentInfo?.config?.foundation_model_architecture);
  }

  return (
    <>

    <ExportDetailsModal
      jobId={viewExportDetails}
      setJobId={setViewExportDetails}
    />

    <Sheet
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography level="h1">Export Model</Typography>
      <Sheet sx={{ overflowY: 'auto', overflowX: 'hidden', mb: '2rem' }}>
        <Divider sx={{ mt: 2, mb: 2 }} />
        <Typography level="title-lg" mb={2}>
          Available Export Formats&nbsp;
        </Typography>
        {plugins?.length === 0 ? (
          <Typography level="title-lg" mb={1} color="warning">
            No Export Formats available, please install an export plugin.
          </Typography>
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
            {plugins?.map((row) => (
              <tr key={row.uniqueId}>
                <td>{row.name}</td>
                <td>{row.description}</td>
                <td style={{ textAlign: 'right' }}>
                      {' '}
                      <Button

                        startDecorator={
                          (jobId < 0)  ? (
                            <CircularProgress size="sm" thickness={2} />
                          ) : (
                            <ArrowRightFromLineIcon />
                          )
                        }
                        color="success"
                        variant="soft"
                        onClick={async (e) => {
                            setJobId(-1);

                            // Currently this call blocks until the export is done
                            const response = await exportRun(
                                experimentInfo.id,
                                row.uniqueId
                              );
 
                            // If we want to track job details we can get this from response
                            // But as long as jobId isn't < 0 the spinner on the export button will stop
                            setJobId(null);
                        }}
                        disabled={!isModelValidArchitecture(row.model_architectures)}
                      >
                        Export
                      </Button>
                    </td>
              </tr>
                )
            )}
          </tbody>
        </Table>
        )}
      </Sheet>



      <Typography level="title-md" startDecorator={<ClockIcon />}>
          Previous Exports
      </Typography>
      <Sheet
          color="warning"
          variant="soft"
          sx={{ px: 1, mt: 1, mb: 2, flex: 1, overflow: 'auto' }}
        >
          <Table>
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Time</th>
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
                        disabled={!(job.status === "COMPLETE" || job.status === "FAILED")}
                        onClick={() => {
                          setViewExportDetails(job.id)
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
    </Sheet>
    </>
  );
}