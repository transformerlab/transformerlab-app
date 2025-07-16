import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Divider,
  List,
  ListItem,
  Box,
  Chip,
  CardCover,
  Button,
  CircularProgress,
} from '@mui/joy';
import { SquareCheckIcon, Type } from 'lucide-react';
import dayjs from 'dayjs';
import useSWR from 'swr';
import JobDetails from './JobDetails';
import JobProgress from '../../Train/JobProgress';
import * as chatAPI from '../../../../lib/transformerlab-api-sdk';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function WorkflowJobProgress({ jobId }: { jobId: string }) {
  const { data: jobData } = useSWR(
    jobId ? chatAPI.Endpoints.Jobs.Get(jobId) : null,
    fetcher,
    { refreshInterval: 2000 },
  );

  if (!jobData) {
    return null;
  }

  return <JobProgress job={jobData} />;
}

export default function WorkflowRunDisplay({
  selectedWorkflowRun,
  experimentInfo,
}) {
  const [viewJobDetails, setViewJobDetails] = React.useState(null);

  if (!selectedWorkflowRun) {
    return <Typography>No workflow run selected</Typography>;
  }

  // Handle empty or malformed workflow run data
  if (!selectedWorkflowRun.run || !selectedWorkflowRun.workflow) {
    return <Typography>Invalid workflow run data</Typography>;
  }

  // Additional validation for empty objects
  if (
    Object.keys(selectedWorkflowRun.run).length === 0 ||
    Object.keys(selectedWorkflowRun.workflow).length === 0
  ) {
    return <Typography>Empty workflow run data</Typography>;
  }

  const { run, jobs = [], workflow } = selectedWorkflowRun;

  const handleCancelWorkflow = async () => {
    try {
      const response = await fetch(
        chatAPI.Endpoints.Workflows.CancelRun(run.id, experimentInfo.id),
        { method: 'GET' },
      );

      if (response.ok) {
        alert('Workflow cancellation requested successfully!');
        // The status will be updated through the SWR refresh in the parent component
      } else {
        alert('Failed to cancel workflow. Please try again.');
      }
    } catch (error) {
      alert('Failed to cancel workflow with error: ' + error);
    }
  };

  return (
    <Card variant="outlined" sx={{ padding: 2 }}>
      <JobDetails
        jobId={viewJobDetails}
        onClose={() => {
          setViewJobDetails(null);
        }}
      />
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 1,
          }}
        >
          <Box>
            <Typography level="h4" sx={{ marginBottom: 1 }}>
              Workflow: {workflow.name}
            </Typography>
            <Typography level="body-md">
              Status: <Chip>{run.status}</Chip>
            </Typography>
            <Typography level="body-md">
              Created At: {run.created_at} | Updated At: {run.updated_at}
            </Typography>
          </Box>
          {(run.status === 'RUNNING' || run.status === 'QUEUED') && (
            <Button
              variant="soft"
              color="danger"
              onClick={handleCancelWorkflow}
              sx={{
                backgroundColor: 'var(--joy-palette-danger-100)',
                color: 'var(--joy-palette-danger-700)',
                '&:hover': {
                  backgroundColor: 'var(--joy-palette-danger-200)',
                },
              }}
            >
              Cancel
            </Button>
          )}
        </Box>
        <Typography level="h4" pt={1}>
          Tasks:
        </Typography>
        <List>
          {jobs.map((job) => (
            <ListItem
              key={job.jobID}
              sx={{
                py: 1,
                borderBottom:
                  '1px solid var(--joy-palette-neutral-outlinedBorder)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 2,
              }}
            >
              {job.status === 'RUNNING' ? (
                <CircularProgress
                  variant="soft"
                  sx={{
                    '--CircularProgress-trackThickness': '4px',
                    '--CircularProgress-progressThickness': '3px',
                    '--CircularProgress-size': '18px',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <SquareCheckIcon style={{ flexShrink: 0 }} />
              )}
              <Box sx={{ flex: '0 0 auto', minWidth: 0 }}>
                <Typography level="title-lg">Job ID: {job.jobID}</Typography>
                <Typography level="title-lg">
                  {`Task: ${job.task || job.taskName || job.metadata?.task_name || 'N/A'}`}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, px: 2 }}>
                <WorkflowJobProgress jobId={job.jobID} />
              </Box>
              <Button
                variant="outlined"
                sx={{ flexShrink: 0 }}
                onClick={() => {
                  setViewJobDetails(job?.jobID);
                }}
              >
                Output
              </Button>
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
