/* eslint-disable jsx-a11y/anchor-is-valid */
import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  DialogContent,
  DialogTitle,
  Divider,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Skeleton,
  Stack,
  Typography,
} from '@mui/joy';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  InfoIcon,
  ServerIcon,
} from 'lucide-react';
import { Link as ReactRouterLink, useNavigate } from 'react-router-dom';

import {
  useSWRWithAuth as useSWR,
  useAuth,
  useAPI,
} from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

import labImage from './img/lab.jpg';
import HexLogo from '../Shared/HexLogo';

interface RecentExperiment {
  id: string | number;
  name: string;
  last_opened_at?: string | null;
  created_at?: string | null;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

function ExperimentCard({
  exp,
  onOpen,
}: {
  exp: RecentExperiment;
  onOpen: (e: RecentExperiment) => void;
}) {
  const subtitle = exp.last_opened_at
    ? `Opened ${relativeTime(exp.last_opened_at)}`
    : exp.created_at
      ? `Created ${relativeTime(exp.created_at)}`
      : 'Not opened yet';

  return (
    <Card
      variant="outlined"
      onClick={() => onOpen(exp)}
      sx={{
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s',
        minWidth: 220,
        flex: '1 1 240px',
        '&:hover': {
          borderColor: 'primary.500',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <Typography level="title-md" noWrap>
        {exp.name}
      </Typography>
      <Typography level="body-sm" color="neutral">
        {subtitle}
      </Typography>
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <ArrowRightIcon size={16} />
      </Box>
    </Card>
  );
}

function HowItWorksModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 560 }}>
        <ModalClose />
        <DialogTitle>How Transformer Lab works</DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box>
              <Typography level="title-sm">Experiments</Typography>
              <Typography level="body-sm" color="neutral">
                The container for a research thread — one hypothesis, one set of
                tasks and jobs. Each experiment carries its own notes (markdown
                log of hypotheses, decisions, and findings) so you can pick up
                where you left off.
              </Typography>
            </Box>
            <Box>
              <Typography level="title-sm">Tasks</Typography>
              <Typography level="body-sm" color="neutral">
                A reusable unit of work defined by a <code>task.yaml</code>{' '}
                (resources, parameters, sweep config, run command) plus any
                scripts it needs. Training, evaluation, inference, generation —
                anything you'd want to run more than once with different inputs.
              </Typography>
            </Box>
            <Box>
              <Typography level="title-sm">Jobs</Typography>
              <Typography level="body-sm" color="neutral">
                Each time you queue a task, a job is created — that&apos;s the
                actual run. Jobs have status, progress, artifacts, and a score
                dict (e.g. <code>{`{accuracy: 0.78}`}</code>) used to compare
                runs and drive sweeps or autoresearch loops.
              </Typography>
            </Box>
            <Box>
              <Typography level="title-sm">Compute providers</Typography>
              <Typography level="body-sm" color="neutral">
                The backends that execute jobs — Local, SkyPilot, Slurm, RunPod,
                dstack, or your own cloud account (AWS/GCP/Azure). A task can
                target a specific provider; otherwise it lands on your default.
              </Typography>
            </Box>
            <Box>
              <Typography level="title-sm">Models &amp; Datasets</Typography>
              <Typography level="body-sm" color="neutral">
                A team-wide registry of models and datasets organized as
                versioned groups (v1, v2, …) so trained checkpoints from one job
                can be published and referenced by name from any future task.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

function OnboardingChecklist({ hasProviders }: { hasProviders: boolean }) {
  const navigate = useNavigate();
  return (
    <Stack spacing={2}>
      <Typography level="h2">Let's get you set up</Typography>
      <Typography level="body-lg" color="neutral">
        A couple of quick steps to start running experiments.
      </Typography>

      <Card variant="outlined">
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography level="title-md">
              ① Create your first experiment
            </Typography>
            <Typography level="body-sm" color="neutral">
              Use the experiment dropdown in the top bar to create one, or pick
              a task from the gallery.
            </Typography>
          </Box>
          <Button
            component={ReactRouterLink}
            to="/tasks-gallery"
            startDecorator={<BookOpenIcon size={16} />}
          >
            Browse Task Gallery
          </Button>
        </Stack>
      </Card>

      <Card variant="outlined">
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography level="title-md">
              {hasProviders
                ? '✓ Compute provider connected'
                : '② Connect a compute provider'}
            </Typography>
            <Typography level="body-sm" color="neutral">
              {hasProviders
                ? 'You have at least one provider — you can queue tasks right away.'
                : "Without compute, you can't run training, evaluation, or inference."}
            </Typography>
          </Box>
          <Button
            variant={hasProviders ? 'outlined' : 'solid'}
            color={hasProviders ? 'neutral' : 'primary'}
            onClick={() => navigate('/team')}
            startDecorator={<ServerIcon size={16} />}
          >
            {hasProviders ? 'Manage' : 'Connect'}
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const { team } = useAuth();
  const { setExperimentId } = useExperimentInfo();

  const { data: userInfo } = useAPI('users', ['me']);
  const { data: recentData, isLoading: experimentsLoading } = useSWR(
    chatAPI.API_URL() === null ? null : chatAPI.Endpoints.Experiment.Recent(),
    fetcher,
  );
  const { data: providerListData } = useAPI('compute_provider', ['list'], {
    teamId: team?.id ?? null,
  });

  const experiments: RecentExperiment[] = useMemo(
    () =>
      Array.isArray(recentData)
        ? recentData.filter(
            (e): e is RecentExperiment =>
              e &&
              (typeof e.id === 'string' || typeof e.id === 'number') &&
              typeof e.name === 'string',
          )
        : [],
    [recentData],
  );
  const providers = useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  const hasProviders = providers.length > 0;
  const hasExperiments = experiments.length > 0;
  const showDashboard = hasProviders && hasExperiments;
  const firstName =
    typeof userInfo?.first_name === 'string' ? userInfo.first_name.trim() : '';
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const openExperiment = async (exp: RecentExperiment) => {
    setExperimentId(String(exp.id));
    try {
      await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Experiment.Touch(String(exp.id)),
        { method: 'POST' },
      );
    } catch {
      // non-critical
    }
    navigate(`/experiment/${encodeURIComponent(exp.name)}/notes`);
  };

  return (
    <Sheet
      sx={{
        overflow: 'auto',
        height: 'calc(100% - 1em)',
        backgroundImage: `url("${labImage}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <Box
        sx={{
          backgroundColor: 'var(--joy-palette-background-surface)',
          opacity: 0.95,
          padding: '2rem',
          overflowY: 'auto',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          mb={3}
        >
          <Typography
            level="h1"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <HexLogo width={40} height={40} /> Transformer Lab
          </Typography>
          <Button
            variant="outlined"
            color="neutral"
            startDecorator={<InfoIcon size={16} />}
            onClick={() => setHowItWorksOpen(true)}
          >
            How it works
          </Button>
        </Stack>

        {experimentsLoading ? (
          <Stack spacing={2}>
            <Skeleton variant="text" level="h2" width="40%" />
            <Stack direction="row" spacing={2}>
              <Skeleton variant="rectangular" height={110} width={240} />
              <Skeleton variant="rectangular" height={110} width={240} />
              <Skeleton variant="rectangular" height={110} width={240} />
            </Stack>
          </Stack>
        ) : showDashboard ? (
          <Stack spacing={3}>
            <Typography level="h2">
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </Typography>

            <Box>
              <Typography level="title-md" mb={1.5}>
                Recent experiments
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                {experiments.map((exp) => (
                  <ExperimentCard
                    key={String(exp.id)}
                    exp={exp}
                    onOpen={openExperiment}
                  />
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography level="title-md" mb={1.5}>
                Quick actions
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <Button
                  component={ReactRouterLink}
                  to="/tasks-gallery"
                  variant="outlined"
                  startDecorator={<BookOpenIcon size={16} />}
                >
                  Browse Task Gallery
                </Button>
                <Button
                  onClick={() => navigate('/team')}
                  variant="outlined"
                  startDecorator={<ServerIcon size={16} />}
                >
                  Manage Compute Providers
                </Button>
                <Button
                  component="a"
                  href="https://lab.cloud/for-teams/"
                  target="_blank"
                  rel="noreferrer"
                  variant="plain"
                >
                  Read the Docs ↗
                </Button>
              </Stack>
            </Box>

            <Chip
              size="sm"
              color={hasProviders ? 'success' : 'warning'}
              variant="soft"
              startDecorator={
                hasProviders ? (
                  <CheckCircleIcon size={14} />
                ) : (
                  <AlertCircleIcon size={14} />
                )
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              {hasProviders
                ? `${providers.length} compute provider${
                    providers.length === 1 ? '' : 's'
                  } connected`
                : 'No compute providers — connect one to run tasks'}
            </Chip>
          </Stack>
        ) : (
          <OnboardingChecklist hasProviders={hasProviders} />
        )}
      </Box>
      <HowItWorksModal
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />
    </Sheet>
  );
}
