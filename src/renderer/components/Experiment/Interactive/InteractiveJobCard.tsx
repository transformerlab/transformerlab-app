import React, { useState } from 'react';
import {
  Button,
  CircularProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
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

function InteractModal({
  jobId,
  open,
  onClose,
}: {
  jobId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { experimentInfo } = useExperimentInfo();

  const url = React.useMemo(() => {
    if (!open || !experimentInfo?.id) return null;
    return chatAPI.Endpoints.Experiment.GetTunnelInfo(
      experimentInfo.id,
      String(jobId),
    );
  }, [open, experimentInfo?.id, jobId]);

  const { data, isLoading } = useSWR(url, fetcher, {
    refreshInterval: 3000,
  });

  const isReady = Boolean(data?.is_ready);
  const values: Record<string, string> = data || {};

  const urls = Object.keys(values)
    .filter((k) => k.endsWith('_url') && typeof values[k] === 'string' && values[k])
    .map((k) => ({
      label: k.replace(/_url$/, '').replace(/_/g, ' '),
      url: values[k],
    }));

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: '95vw',
          width: '95vw',
          height: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Interact (Job {jobId})
        </Typography>
        <Divider />
        {!isReady ? (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mt: 2 }}
          >
            <Chip color="warning" variant="soft">
              Waiting for service to start
            </Chip>
            {isLoading && <CircularProgress size="sm" />}
          </Stack>
        ) : urls.length === 0 ? (
          <Typography level="body-sm" sx={{ mt: 2 }}>
            No service URLs available for this job.
          </Typography>
        ) : (
          <Tabs
            defaultValue={0}
            sx={{ flex: 1, minHeight: 0, mt: 1, overflow: 'hidden' }}
          >
            <TabList>
              {urls.map(({ label }, i) => (
                <Tab key={label} value={i} sx={{ textTransform: 'capitalize' }}>
                  {label}
                </Tab>
              ))}
            </TabList>
            {urls.map(({ label, url: src }, i) => (
              <TabPanel
                key={label}
                value={i}
                sx={{ flex: 1, p: 0, overflow: 'hidden' }}
              >
                <Box
                  component="iframe"
                  src={src}
                  sx={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: 'sm',
                  }}
                />
              </TabPanel>
            ))}
          </Tabs>
        )}
      </ModalDialog>
    </Modal>
  );
}

function getTypeConfig(interactiveType: string) {
  return INTERACTIVE_TYPE_CONFIG[interactiveType] || DEFAULT_TYPE_CONFIG;
}

export default function InteractiveJobCard({
  job,
  onDeleteJob,
}: InteractiveJobCardProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [interactOpen, setInteractOpen] = useState(false);
  const jobData = job.job_data || {};
  const isPlaceholder = !!job.placeholder;
  const interactiveType =
    jobData.interactive_type ||
    (typeof jobData === 'string'
      ? JSON.parse(jobData || '{}')?.interactive_type
      : null) ||
    (isPlaceholder ? null : 'vscode');

  const typeConfig = interactiveType ? getTypeConfig(interactiveType) : null;
  const TypeIcon = typeConfig?.icon;
  const isInteractive =
    job.status === 'INTERACTIVE' || job.status === 'RUNNING';
  const title =
    jobData.cluster_name ||
    jobData.template_name ||
    (isPlaceholder ? '' : `Job ${job.id}`);
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
              bgcolor: typeConfig
                ? `var(--joy-palette-${typeConfig.color}-softBg)`
                : 'var(--joy-palette-neutral-softBg)',
              color: typeConfig
                ? `var(--joy-palette-${typeConfig.color}-softColor)`
                : 'var(--joy-palette-neutral-softColor)',
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            {TypeIcon && <TypeIcon size={20} />}
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
            <Chip
              variant="soft"
              color={typeConfig?.color ?? 'neutral'}
              size="sm"
            >
              {typeConfig?.label ?? '\u00A0'}
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
                color="neutral"
                size="sm"
                onClick={() => setConnectOpen(true)}
              >
                Logs
              </Button>
              <Button
                variant="soft"
                color="primary"
                size="sm"
                onClick={() => setInteractOpen(true)}
              >
                Interact
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
      <InteractModal
        jobId={jobIdNum}
        open={interactOpen}
        onClose={() => setInteractOpen(false)}
      />
    </Card>
  );
}
