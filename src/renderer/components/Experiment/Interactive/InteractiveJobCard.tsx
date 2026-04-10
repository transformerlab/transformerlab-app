import React, { useState, useRef, useEffect } from 'react';
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
import { isTerminalJobStatus } from 'renderer/lib/utils';
import JobProgress from '../Tasks/JobProgress';
import InteractiveModal from '../Tasks/InteractiveModal';
import InteractIframeModal from './InteractIframeModal';
import EmbeddableStreamingOutput from '../Tasks/EmbeddableStreamingOutput';

interface LaunchProgressInfo {
  phase?: string;
  percent?: number;
  message?: string;
}

interface InteractiveJobCardProps {
  job: any;
  /** Live launch progress from check-status polling; falls back to job.job_data.launch_progress in JobProgress */
  launchProgress?: LaunchProgressInfo | null;
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
  launchProgress,
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
  const showDeleteAction =
    isTerminalJobStatus(job.status) || job.status === 'STOPPING';
  const showActions = isInteractive || isLaunching;
  const title =
    jobData.cluster_name ||
    jobData.template_name ||
    (isPlaceholder ? '' : `Job ${job.id}`);
  const jobIdValue = job?.id == null ? null : String(job.id);

  const tunnelInfoUrl = React.useMemo(() => {
    if (!isInteractive || !experimentInfo?.id) return null;
    return chatAPI.Endpoints.Experiment.GetTunnelInfo(
      experimentInfo.id,
      String(jobIdValue),
    );
  }, [isInteractive, experimentInfo?.id, jobIdValue]);

  const { data: tunnelData } = useSWR(tunnelInfoUrl, fetcher, {
    refreshInterval: 3000,
  });

  const tunnelReady = Boolean(tunnelData?.is_ready);

  // Track how long tunnel has been not-ready while job is INTERACTIVE.
  // After a timeout, show a warning so the user isn't stuck on "Launching…" forever.
  const TUNNEL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
  const waitingSinceRef = useRef<number | null>(null);
  const [tunnelTimedOut, setTunnelTimedOut] = useState(false);

  useEffect(() => {
    if (tunnelReady || !isInteractive) {
      // Reset when tunnel becomes ready or job is no longer interactive.
      waitingSinceRef.current = null;
      setTunnelTimedOut(false);
      return;
    }

    // Start the clock if not already running.
    if (waitingSinceRef.current === null) {
      waitingSinceRef.current = Date.now();
    }

    const elapsed = Date.now() - waitingSinceRef.current;
    if (elapsed >= TUNNEL_TIMEOUT_MS) {
      setTunnelTimedOut(true);
      return;
    }

    // Schedule a check for when the timeout would fire.
    const timer = setTimeout(
      () => setTunnelTimedOut(true),
      TUNNEL_TIMEOUT_MS - elapsed,
    );
    return () => clearTimeout(timer);
  }, [tunnelReady, isInteractive, tunnelData]);

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
          {showDeleteAction && (
            <IconButton
              variant="plain"
              color="danger"
              size="sm"
              onClick={() => onDeleteJob(String(job.id))}
              sx={{ mt: -0.5, mr: -0.5 }}
            >
              <Trash2Icon size={16} />
            </IconButton>
          )}
        </Stack>

        <Box>
          <JobProgress
            job={job}
            launchProgress={launchProgress}
            hideCircularLaunchProgressAtOrAbove={
              job.status === 'INTERACTIVE' ? 99 : undefined
            }
          />
          {tunnelTimedOut && !tunnelReady && (
            <Typography level="body-xs" color="warning" sx={{ mt: 0.5 }}>
              Startup may have stalled. Check Logs.
            </Typography>
          )}
        </Box>

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
                {tunnelReady
                  ? 'Interact'
                  : tunnelTimedOut
                    ? 'Waiting…'
                    : 'Launching…'}
              </Button>
            </Stack>
          </>
        )}
      </CardContent>
      <InteractiveModal
        jobId={connectOpen ? jobIdValue : null}
        setJobId={() => setConnectOpen(false)}
        embeddedOutput={
          <EmbeddableStreamingOutput
            jobId={jobIdValue}
            tabs={['provider']}
            jobStatus={job?.status || ''}
          />
        }
      />
      <InteractIframeModal
        jobId={jobIdValue}
        open={interactOpen}
        onClose={() => setInteractOpen(false)}
      />
    </Card>
  );
}
