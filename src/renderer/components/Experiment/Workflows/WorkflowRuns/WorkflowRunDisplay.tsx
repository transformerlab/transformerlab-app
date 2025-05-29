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
import JobDetails from './JobDetails';

export default function WorkflowRunDisplay({ selectedWorkflowRun }) {
  const [viewJobDetails, setViewJobDetails] = React.useState(null);

  if (!selectedWorkflowRun) {
    return <Typography>No workflow run selected</Typography>;
  }

  const { run, jobs, workflow } = selectedWorkflowRun;

  const formatDuration = (start, end) => {
    if (!start || !end) {
      return null;
    }

    const startTime = new Date(start);
    const endTime = new Date(end);
    const duration = (endTime - startTime) / 1000; // duration in seconds
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
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
        <Typography level="h4" sx={{ marginBottom: 1 }}>
          Workflow: {workflow.name}
        </Typography>
        <Typography level="body-md">
          Status: <Chip>{run.status}</Chip>
        </Typography>
        <Typography level="body-md">
          Created At: {run.created_at} | Updated At: {run.updated_at}
        </Typography>
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
              }}
            >
              {job.status === 'RUNNING' ? (
                <CircularProgress
                  variant="soft"
                  sx={{
                    '--CircularProgress-trackThickness': '4px',
                    '--CircularProgress-progressThickness': '3px',
                    '--CircularProgress-size': '18px',
                  }}
                />
              ) : (
                <SquareCheckIcon />
              )}
              <Box sx={{ width: '100%' }}>
                <Typography level="title-lg">Job ID: {job.jobID}</Typography>
                <Typography level="title-md">{`Task: ${job.taskName}`}</Typography>
                <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                  Status:{' '}
                  <Chip
                    color={job?.status === 'RUNNING' ? 'success' : 'warning'}
                  >
                    {job.status}
                  </Chip>
                </Typography>
                <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                  Start: {dayjs(job?.jobStartTime).fromNow()}
                  {/* | End: {dayjs(job?.jobEndTime).fromNow()} */}
                </Typography>
                <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                  Duration: {formatDuration(job.jobStartTime, job.jobEndTime)}
                </Typography>
              </Box>
              <Button
                variant="outlined"
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
