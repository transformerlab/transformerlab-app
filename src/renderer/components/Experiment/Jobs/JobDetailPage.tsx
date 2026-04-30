import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/joy/Box';
import CircularProgress from '@mui/joy/CircularProgress';
import Typography from '@mui/joy/Typography';
import Chip from '@mui/joy/Chip';
import IconButton from '@mui/joy/IconButton';
import Tooltip from '@mui/joy/Tooltip';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemButton from '@mui/joy/ListItemButton';
import { ArrowLeftIcon, LinkIcon } from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useSWRWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { jobChipColor } from 'renderer/lib/utils';
import {
  getDefaultSection,
  getVisibleSections,
  generateJobPermalink,
  type SectionKey,
  type JobRecord,
} from './jobDetailUtils';
import OverviewSection from './OverviewSection';
import LogsSection from './LogsSection';
import CheckpointsSection from './CheckpointsSection';
import ArtifactsSection from './ArtifactsSection';
import EvalResultsSection from './EvalResultsSection';
import SweepResultsSection from './SweepResultsSection';

const SECTION_LABELS: Record<SectionKey, string> = {
  overview: 'Overview',
  logs: 'Logs',
  checkpoints: 'Checkpoints',
  artifacts: 'Artifacts',
  evalResults: 'Eval Results',
  sweepResults: 'Sweep Results',
};

const VALID_SECTIONS = new Set<SectionKey>([
  'overview',
  'logs',
  'checkpoints',
  'artifacts',
  'evalResults',
  'sweepResults',
]);

export default function JobDetailPage() {
  const { experimentName = '', jobId = '' } = useParams<{
    experimentName: string;
    jobId: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSectionFromUrl = (() => {
    const s = searchParams.get('section');
    return s && VALID_SECTIONS.has(s as SectionKey) ? (s as SectionKey) : null;
  })();
  const { experimentInfo, setExperimentId } = useExperimentInfo();

  useEffect(() => {
    if (experimentName) setExperimentId(experimentName);
  }, [experimentName, setExperimentId]);

  const {
    data: jobData,
    isError,
    isLoading: jobLoading,
  } = useSWRWithAuth(
    experimentInfo?.id && jobId
      ? chatAPI.Endpoints.Jobs.Get(experimentInfo.id, jobId)
      : null,
  );

  const job: JobRecord | null = jobData ?? null;
  const visibleSections: SectionKey[] = job
    ? getVisibleSections(job)
    : ['overview', 'logs'];
  const [activeSection, setActiveSection] = useState<SectionKey | null>(
    initialSectionFromUrl,
  );

  const { data: allTemplates } = useSWRWithAuth(
    experimentInfo?.id ? chatAPI.Endpoints.Task.List(experimentInfo.id) : null,
  );

  const { backHref, backLabel, taskCrumb } = useMemo(() => {
    const fallback = {
      backHref: `/experiment/${experimentName}/tasks`,
      backLabel: `Back to ${experimentName} tasks`,
      taskCrumb: null as { name: string; href: string } | null,
    };
    if (!job) return fallback;
    const jd: any = job.job_data ?? {};
    const taskName: string =
      (jd.task_name && String(jd.task_name).trim()) ||
      (jd.template_name && String(jd.template_name).trim()) ||
      '';
    const list = Array.isArray(allTemplates)
      ? allTemplates
      : ((allTemplates as any)?.data ?? []);
    let taskId: string | null = null;
    const directId = jd.task_id ? String(jd.task_id) : '';
    if (directId && (list as any[]).some((t) => String(t.id) === directId)) {
      taskId = directId;
    } else if (taskName) {
      const match = (list as any[]).find(
        (t) =>
          String(t?.name ?? '').trim() === taskName &&
          t.experiment_id === experimentInfo?.id,
      );
      if (match) taskId = String(match.id);
    }
    if (!taskId) return fallback;
    const label = taskName || 'task';
    const href = `/experiment/${experimentName}/tasks/${taskId}/runs`;
    return {
      backHref: href,
      backLabel: `Back to ${label} runs`,
      taskCrumb: { name: label, href },
    };
  }, [job, allTemplates, experimentInfo?.id, experimentName]);

  const effectiveSection: SectionKey =
    activeSection ?? (job ? getDefaultSection(job.status ?? '') : 'overview');

  if (!experimentInfo) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography level="h4" color="danger">
          Job not found
        </Typography>
        <Typography
          sx={{ mt: 1, cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => navigate(`/experiment/${experimentName}/tasks`)}
        >
          Back to Tasks
        </Typography>
      </Box>
    );
  }

  if (jobLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={backLabel}>
            <IconButton
              size="sm"
              variant="plain"
              onClick={() => navigate(backHref)}
            >
              <ArrowLeftIcon size={16} />
            </IconButton>
          </Tooltip>
          <Typography level="title-sm" sx={{ color: 'text.secondary' }}>
            {experimentName}
          </Typography>
          {taskCrumb && (
            <>
              <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>
                /
              </Typography>
              <Typography
                level="title-sm"
                sx={{
                  color: 'text.secondary',
                  cursor: 'pointer',
                  '&:hover': { textDecoration: 'underline' },
                }}
                onClick={() => navigate(taskCrumb.href)}
              >
                {taskCrumb.name}
              </Typography>
            </>
          )}
          <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>
            /
          </Typography>
          <Typography level="title-sm">
            Job {job?.id ? job.id.slice(0, 8) : jobId.slice(0, 8)}
          </Typography>
          {job?.type && (
            <Chip size="sm" color="primary" variant="soft">
              {job.type}
            </Chip>
          )}
          {job?.status && (
            <Chip
              size="sm"
              color={jobChipColor(job.status) as any}
              variant="soft"
            >
              {job.status}
            </Chip>
          )}
        </Box>
        <Tooltip title="Copy permalink">
          <IconButton
            size="sm"
            variant="plain"
            color="neutral"
            onClick={() => {
              navigator.clipboard
                .writeText(
                  window.location.href.split('#')[0] +
                    generateJobPermalink(experimentName, jobId),
                )
                .catch((err) =>
                  console.error('Failed to copy permalink:', err),
                );
            }}
          >
            <LinkIcon size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Body: sidebar + content */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <Box
          sx={{
            width: 160,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            overflowY: 'auto',
          }}
        >
          <List size="sm" sx={{ py: 1 }}>
            {visibleSections.map((key) => (
              <ListItem key={key}>
                <ListItemButton
                  selected={effectiveSection === key}
                  onClick={() => setActiveSection(key)}
                >
                  {SECTION_LABELS[key]}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Main content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {effectiveSection === 'overview' && <OverviewSection job={job} />}
          {effectiveSection === 'logs' && (
            <LogsSection jobId={jobId} jobStatus={job?.status ?? ''} />
          )}
          {effectiveSection === 'checkpoints' && (
            <CheckpointsSection jobId={jobId} />
          )}
          {effectiveSection === 'artifacts' && (
            <ArtifactsSection jobId={jobId} />
          )}
          {effectiveSection === 'evalResults' && (
            <EvalResultsSection
              jobId={jobId}
              evalFiles={job?.job_data?.eval_results ?? []}
            />
          )}
          {effectiveSection === 'sweepResults' && (
            <SweepResultsSection jobId={jobId} />
          )}
        </Box>
      </Box>
    </Box>
  );
}
