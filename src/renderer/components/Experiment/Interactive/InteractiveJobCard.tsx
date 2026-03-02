import React from 'react';
import {
  Button,
  Stack,
  Typography,
  Card,
  CardContent,
  Chip,
  Box,
  IconButton,
} from '@mui/joy';
import dayjs from 'dayjs';
import { Trash2Icon, LogsIcon } from 'lucide-react';
import JobProgress from '../Tasks/JobProgress';
import { jobChipColor } from 'renderer/lib/utils';

interface InteractiveJobCardProps {
  job: any;
  onViewOutput: (jobId: number) => void;
  onViewInteractive: (jobId: number) => void;
  onDeleteJob: (jobId: string) => void;
}

function getInteractiveTypeLabel(interactiveType: string): string {
  switch (interactiveType) {
    case 'jupyter':
      return 'Jupyter';
    case 'vllm':
      return 'vLLM';
    case 'ollama':
      return 'Ollama';
    case 'ssh':
      return 'SSH';
    case 'vscode':
    default:
      return 'VS Code';
  }
}

function getInteractiveTypeColor(
  interactiveType: string,
): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
  switch (interactiveType) {
    case 'jupyter':
      return 'warning';
    case 'vllm':
      return 'success';
    case 'ollama':
      return 'primary';
    case 'ssh':
      return 'danger';
    case 'vscode':
    default:
      return 'primary';
  }
}

export default function InteractiveJobCard({
  job,
  onViewOutput,
  onViewInteractive,
  onDeleteJob,
}: InteractiveJobCardProps) {
  const jobData = job.job_data || {};
  const interactiveType =
    jobData.interactive_type ||
    (typeof jobData === 'string'
      ? JSON.parse(jobData || '{}')?.interactive_type
      : null) ||
    'vscode';

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
          >
            <Typography level="title-md" sx={{ flex: 1, minWidth: 0 }}>
              {jobData.cluster_name || jobData.template_name || `Job ${job.id}`}
            </Typography>
            <Chip variant="soft" color={jobChipColor(job.status)} size="sm">
              {job.status}
            </Chip>
            <Chip
              variant="soft"
              color={getInteractiveTypeColor(interactiveType)}
              size="sm"
            >
              {getInteractiveTypeLabel(interactiveType)}
            </Chip>
          </Stack>
          <Box>
            <JobProgress job={job} />
          </Box>
          {jobData.start_time && (
            <Typography level="body-xs" color="neutral">
              Started:{' '}
              {dayjs(jobData.start_time).local().format('MMM D, YYYY HH:mm:ss')}
            </Typography>
          )}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {job.status === 'INTERACTIVE' &&
              (interactiveType === 'vscode' ||
                interactiveType === 'jupyter' ||
                interactiveType === 'vllm' ||
                interactiveType === 'ollama' ||
                interactiveType === 'ssh') && (
                <>
                  <Button
                    variant="plain"
                    size="sm"
                    startDecorator={<LogsIcon size={16} />}
                    onClick={() => onViewOutput(parseInt(job.id, 10))}
                  >
                    Output
                  </Button>
                  <Button
                    variant="soft"
                    color="primary"
                    size="sm"
                    onClick={() => onViewInteractive(parseInt(job.id, 10))}
                  >
                    Interactive Setup
                  </Button>
                </>
              )}
            <IconButton
              variant="plain"
              color="danger"
              size="sm"
              onClick={() => onDeleteJob(String(job.id))}
            >
              <Trash2Icon size={16} />
            </IconButton>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
