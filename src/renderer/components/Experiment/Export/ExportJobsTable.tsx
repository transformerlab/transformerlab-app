import {
  Button,
  IconButton,
  ButtonGroup,
  Sheet,
  Table,
  Typography,
} from '@mui/joy';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';
import JobProgress from '../Train/JobProgress';
import SafeJSONParse from '../../Shared/SafeJSONParse';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
dayjs.extend(relativeTime);
dayjs.extend(duration);

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Job {
  id: string;
  status: string;
  progress: string | number;
  type: string;
  experiment_id: number;
  job_data: {
    exporter_name: string;
    plugin?: string;
    output_model_name: string;
    config?: string | object; // Add config field which might be JSON string or object
    start_time?: string;
    end_time?: string;
    completion_status?: string;
    completion_details?: string;
  };
}

const ExportJobsTable = () => {
  const [viewOutputFromJob, setViewOutputFromJob] = useState<string | number>(
    -1,
  );

  const {
    data: jobs,
    error,
    isLoading,
    mutate: jobsMutate,
  } = useSWR<Job[]>(
    chatAPI.Endpoints.Jobs.GetJobsOfType('EXPORT', ''),
    fetcher,
    {
      refreshInterval: 2000,
    },
  );

  // Update status so progress bar displays
  jobs?.forEach((job) => {
    if (job.status === 'Started') {
      job.status = 'RUNNING';
    }
  });

  return (
    <>
      <ViewOutputModalStreaming
        jobId={viewOutputFromJob}
        setJobId={setViewOutputFromJob}
      />
      <Typography level="h3" sx={{ mt: 2, mb: 1 }}>
        Executions
      </Typography>
      <Sheet sx={{ overflowY: 'scroll' }}>
        <Table stickyHeader>
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Id</th>
              <th>Exporter</th>
              <th>Progress</th>
              <th>Output Model</th>
              <th>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {jobs?.map((job: Job) => {
              return (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{job?.job_data?.plugin}</td>
                  <td>
                    <JobProgress job={job} />
                  </td>
                  <td>
                    {(() => {
                      // Try to get output model name from job_data first
                      let outputModelName = job?.job_data?.output_model_name;

                      // If not found, try to parse it from config using SafeJSONParse
                      if (!outputModelName && job?.job_data?.config) {
                        const config = SafeJSONParse(
                          job.job_data.config,
                          {} as any,
                        );
                        outputModelName = config?.output_model_name;
                      }

                      return outputModelName || 'N/A';
                    })()}
                  </td>
                  <td>
                    <ButtonGroup
                      variant="soft"
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      <Button
                        onClick={() => {
                          setViewOutputFromJob(job?.id);
                        }}
                      >
                        View Output
                      </Button>
                      <IconButton variant="plain">
                        <Trash2Icon
                          onClick={async () => {
                            await fetch(chatAPI.Endpoints.Jobs.Delete(job?.id));
                            jobsMutate();
                          }}
                        />
                      </IconButton>
                    </ButtonGroup>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Sheet>
    </>
  );
};

export default ExportJobsTable;
