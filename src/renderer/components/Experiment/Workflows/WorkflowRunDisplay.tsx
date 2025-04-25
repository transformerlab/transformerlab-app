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
} from '@mui/joy';
import { SquareCheckIcon } from 'lucide-react';

export default function WorkflowRunDisplay({ selectedWorkflowRun }) {
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
      <CardContent>
        <Typography level="h4" sx={{ marginBottom: 1 }}>
          Workflow: {workflow.name}
        </Typography>
        <Typography level="body-md" sx={{ marginBottom: 2 }}>
          Status: <Chip>{run.status}</Chip>
        </Typography>
        <Typography level="body-md" sx={{ marginBottom: 2 }}>
          Created At: {run.created_at} | Updated At: {run.updated_at}
        </Typography>
        <Divider />
        <Typography level="h4" sx={{ marginTop: 2, marginBottom: 1 }}>
          Tasks:
        </Typography>
        <List>
          {jobs.map((job) => (
            <ListItem key={job.jobID}>
              <Box>
                <Typography
                  level="title-md"
                  startDecorator={<SquareCheckIcon />}
                >{`Task: ${job.taskName}`}</Typography>
                <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                  Status: <Chip>{job.status}</Chip>
                </Typography>
                <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                  {`Start: ${job?.jobStartTime} | End: ${job?.jobEndTime}`}
                </Typography>
                <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                  Duration: {formatDuration(job.jobStartTime, job.jobEndTime)}
                </Typography>
                <Divider sx={{ marginTop: 1 }} />
              </Box>
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
