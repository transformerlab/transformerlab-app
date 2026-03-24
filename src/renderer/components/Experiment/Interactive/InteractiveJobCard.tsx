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
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import JobProgress from '../Tasks/JobProgress';
import InteractiveModal from '../Tasks/InteractiveModal';
import InteractIframeModal from './InteractIframeModal';
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

const DEFAULT_TYPE_CONFIG = {
  label: 'Interactive',
  color: 'neutral' as const,
  icon: null,
};

function getTypeConfig(interactiveType: string) {
  return INTERACTIVE_TYPE_CONFIG[interactiveType] || DEFAULT_TYPE_CONFIG;
}

export default function InteractiveJobCard({
  job,
  onDeleteJob,
}: InteractiveJobCardProps) {
  type InteractiveGalleryEntry = {
    id?: string;
    name?: string;
    icon?: string;
    interactive_type?: string;
  };

  const [connectOpen, setConnectOpen] = useState(false);
  const [interactOpen, setInteractOpen] = useState(false);
  const jobData = job.job_data || {};
  const isPlaceholder = !!job.placeholder;
  const interactiveGalleryId = jobData.interactive_gallery_id;
  const interactiveType =
    jobData.interactive_type ||
    (typeof jobData === 'string'
      ? JSON.parse(jobData || '{}')?.interactive_type
      : null) ||
    null;

  const { experimentInfo } = useExperimentInfo();
  const typeConfig = interactiveType ? getTypeConfig(interactiveType) : null;
  const TypeIcon = typeConfig?.icon;

  // Resolve a richer display name/icon from the interactive gallery entry.
  // This avoids hard-coding per-interactive-type UI logic and lets new gallery
  // entries render correctly even if `interactive_type` is missing.
  const interactiveGalleryUrl =
    experimentInfo?.id && (interactiveGalleryId || interactiveType)
      ? chatAPI.Endpoints.Task.InteractiveGallery(experimentInfo.id)
      : null;
  const { data: interactiveGalleryResponse } = useSWR(
    interactiveGalleryUrl,
    fetcher,
  );
  const galleryEntries: InteractiveGalleryEntry[] = Array.isArray(
    interactiveGalleryResponse?.data,
  )
    ? interactiveGalleryResponse.data
    : [];
  const galleryEntry =
    (interactiveGalleryId
      ? galleryEntries.find((e) => e?.id === interactiveGalleryId)
      : null) ||
    (interactiveType
      ? galleryEntries.find((e) => e?.interactive_type === interactiveType) ||
        galleryEntries.find((e) => e?.id === interactiveType)
      : null);

  let boxBg = 'var(--joy-palette-neutral-softBg)';
  let boxColor = 'var(--joy-palette-neutral-softColor)';
  if (!galleryEntry && typeConfig) {
    boxBg = `var(--joy-palette-${typeConfig.color}-softBg)`;
    boxColor = `var(--joy-palette-${typeConfig.color}-softColor)`;
  }
  const chipColor = galleryEntry ? 'neutral' : (typeConfig?.color ?? 'neutral');
  const isInteractive =
    job.status === 'INTERACTIVE' ||
    job.status === 'RUNNING' ||
    job.status === 'STOPPING';
  const isLaunching = job.status === 'LAUNCHING' || job.status === 'WAITING';
  const isFailed = job.status === 'FAILED';
  const showActions = isInteractive || isLaunching;
  const title =
    jobData.cluster_name ||
    jobData.template_name ||
    (isPlaceholder ? '' : `Job ${job.id}`);
  const jobIdNum = parseInt(job.id, 10);

  const tunnelInfoUrl = React.useMemo(() => {
    if (!isInteractive || !experimentInfo?.id) return null;
    return chatAPI.Endpoints.Experiment.GetTunnelInfo(
      experimentInfo.id,
      String(jobIdNum),
    );
  }, [isInteractive, experimentInfo?.id, jobIdNum]);

  const { data: tunnelData } = useSWR(tunnelInfoUrl, fetcher, {
    refreshInterval: 3000,
  });

  const tunnelReady = Boolean(tunnelData?.is_ready);

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        transition: 'box-shadow 0.2s',
        '&:hover': {
          boxShadow: 'sm',
        },
        ...(isFailed && {
          borderColor: 'var(--joy-palette-danger-300)',
          bgcolor: 'var(--joy-palette-danger-softBg)',
        }),
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
              bgcolor: boxBg,
              color: boxColor,
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            {galleryEntry?.icon ? (
              <img
                src={galleryEntry.icon}
                alt={galleryEntry.name || 'Interactive'}
                width={20}
                height={20}
                style={{ display: 'block' }}
              />
            ) : (
              TypeIcon && <TypeIcon size={20} />
            )}
          </Box>
          <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0.25}>
            <Typography
              level="title-sm"
              noWrap
              title={title}
              sx={{ fontWeight: 600, minHeight: '1.2em' }}
            >
              {title}
            </Typography>
            <Chip variant="soft" color={chipColor} size="sm">
              {galleryEntry?.name ||
                jobData.template_name ||
                typeConfig?.label ||
                '\u00A0'}
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

        {isFailed && (
          <>
            <Divider />
            {jobData.error_msg && (
              <Typography level="body-xs" color="danger" sx={{ wordBreak: 'break-word' }}>
                Error: {jobData.error_msg}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="soft"
                color="neutral"
                size="sm"
                onClick={() => setConnectOpen(true)}
              >
                Logs
              </Button>
            </Stack>
          </>
        )}

        {showActions && (
          <>
            <Divider />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="soft"
                color="neutral"
                size="sm"
                onClick={() => setConnectOpen(true)}
              >
                Logs
              </Button>
              <Button
                variant="soft"
                color={tunnelReady ? 'success' : 'neutral'}
                size="sm"
                disabled={!tunnelReady}
                onClick={() => setInteractOpen(true)}
              >
                {tunnelReady ? 'Interact' : 'Launching…'}
              </Button>
            </Stack>
          </>
        )}
      </CardContent>
      <InteractiveModal
        jobId={connectOpen ? jobIdNum : -1}
        setJobId={() => setConnectOpen(false)}
        embeddedOutput={
          <EmbeddableStreamingOutput
            jobId={jobIdNum}
            tabs={['provider']}
            jobStatus={job?.status || ''}
          />
        }
      />
      <InteractIframeModal
        jobId={jobIdNum}
        open={interactOpen}
        onClose={() => setInteractOpen(false)}
      />
    </Card>
  );
}
