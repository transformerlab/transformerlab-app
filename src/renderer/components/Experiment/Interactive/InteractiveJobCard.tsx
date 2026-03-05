import React, { useState } from 'react';
import {
  Button,
  Stack,
  Typography,
  Card,
  CardContent,
  Chip,
  Box,
  IconButton,
  Divider,
} from '@mui/joy';
import { Trash2Icon } from 'lucide-react';
import JobProgress from '../Tasks/JobProgress';
import InteractiveModal from '../Tasks/InteractiveModal';
import EmbeddableStreamingOutput from '../Tasks/EmbeddableStreamingOutput';

interface InteractiveJobCardProps {
  job: any;
  onDeleteJob: (jobId: string) => void;
}

function VscodeIcon() {
  return (
    <img
      src="https://lab.cloud/img/icons/vscode.png"
      alt="VS Code"
      width={20}
      height={20}
      style={{ display: 'block' }}
    />
  );
}

function JupyterIcon() {
  return (
    <img
      src="https://lab.cloud/img/icons/jupyter.png"
      alt="Jupyter"
      width={20}
      height={20}
      style={{ display: 'block' }}
    />
  );
}

function SshIcon() {
  return (
    <img
      src="https://lab.cloud/img/icons/ssh.png"
      alt="SSH"
      width={20}
      height={20}
      style={{ display: 'block' }}
    />
  );
}

function VllmIcon() {
  return (
    <img
      src="https://lab.cloud/img/icons/vllm.png"
      alt="vLLM"
      width={20}
      height={20}
      style={{ display: 'block' }}
    />
  );
}

function OllamaIcon() {
  return (
    <img
      src="https://lab.cloud/img/icons/ollama.png"
      alt="Ollama"
      width={20}
      height={20}
      style={{ display: 'block' }}
    />
  );
}

const INTERACTIVE_TYPE_CONFIG: Record<
  string,
  {
    label: string;
    color: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
    icon: React.ElementType;
  }
> = {
  vscode: { label: 'VS Code', color: 'primary', icon: VscodeIcon },
  jupyter: { label: 'Jupyter', color: 'warning', icon: JupyterIcon },
  vllm: { label: 'vLLM', color: 'success', icon: VllmIcon },
  ollama: { label: 'Ollama', color: 'primary', icon: OllamaIcon },
  ssh: { label: 'SSH', color: 'danger', icon: SshIcon },
};

const DEFAULT_TYPE_CONFIG = INTERACTIVE_TYPE_CONFIG.vscode;

function getTypeConfig(interactiveType: string) {
  return INTERACTIVE_TYPE_CONFIG[interactiveType] || DEFAULT_TYPE_CONFIG;
}

export default function InteractiveJobCard({
  job,
  onDeleteJob,
}: InteractiveJobCardProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const jobData = job.job_data || {};
  const interactiveType =
    jobData.interactive_type ||
    (typeof jobData === 'string'
      ? JSON.parse(jobData || '{}')?.interactive_type
      : null) ||
    'vscode';

  const typeConfig = getTypeConfig(interactiveType);
  const TypeIcon = typeConfig.icon;
  const isInteractive = job.status === 'INTERACTIVE';
  const title =
    jobData.cluster_name || jobData.template_name || `Job ${job.id}`;
  const jobIdNum = parseInt(job.id, 10);

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        transition: 'box-shadow 0.2s',
        '&:hover': {
          boxShadow: 'sm',
        },
      }}
    >
      <CardContent sx={{ gap: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 'sm',
              bgcolor: `var(--joy-palette-${typeConfig.color}-softBg)`,
              color: `var(--joy-palette-${typeConfig.color}-softColor)`,
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            <TypeIcon size={20} />
          </Box>
          <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0.25}>
            <Typography
              level="title-sm"
              noWrap
              title={title}
              sx={{ fontWeight: 600 }}
            >
              {title}
            </Typography>
            <Chip variant="soft" color={typeConfig.color} size="sm">
              {typeConfig.label}
            </Chip>
          </Stack>
          <IconButton
            variant="plain"
            color="danger"
            size="sm"
            onClick={() => onDeleteJob(String(job.id))}
            sx={{ mt: -0.5, mr: -0.5 }}
          >
            <Trash2Icon size={16} />
          </IconButton>
        </Stack>

        <Box>
          <JobProgress job={job} />
        </Box>

        {isInteractive && (
          <>
            <Divider />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="soft"
                color="primary"
                size="sm"
                onClick={() => setConnectOpen(true)}
              >
                Connect
              </Button>
            </Stack>
          </>
        )}
      </CardContent>
      <InteractiveModal
        jobId={connectOpen ? jobIdNum : -1}
        setJobId={() => setConnectOpen(false)}
        embeddedOutput={
          <EmbeddableStreamingOutput jobId={jobIdNum} tabs={['provider']} />
        }
      />
    </Card>
  );
}
