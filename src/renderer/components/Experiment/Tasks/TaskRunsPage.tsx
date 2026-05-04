import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { useSWRWithAuth as useSWR, useAuth } from 'renderer/lib/authContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { isDeletableJobRecordStatus } from 'renderer/lib/utils';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';
import { generateTaskRunsPermalink } from '../Jobs/jobDetailUtils';
import JobsList from './JobsList';
import { jobBelongsToTask } from './taskJobMatching';

function isInteractiveTemplate(task: any): boolean {
  const config =
    typeof task?.config === 'string'
      ? SafeJSONParse(task.config, {})
      : (task?.config ?? {});
  return (
    task?.subtype === 'interactive' ||
    config?.subtype === 'interactive' ||
    Boolean(task?.interactive_type) ||
    Boolean(config?.interactive_type)
  );
}

export default function TaskRunsPage() {
  const { experimentName = '', taskId = '' } = useParams<{
    experimentName: string;
    taskId: string;
  }>();
  const navigate = useNavigate();
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const { fetchWithAuth } = useAuth();
  const { addNotification } = useNotification();

  useEffect(() => {
    if (experimentName) setExperimentId(experimentName);
  }, [experimentName, setExperimentId]);

  const {
    data: task,
    isError: taskError,
    isLoading: taskLoading,
  } = useSWR(
    experimentInfo?.id && taskId
      ? chatAPI.Endpoints.Task.GetByID(experimentInfo.id, taskId)
      : null,
    fetcher,
  );

  const { data: allTemplates } = useSWR(
    experimentInfo?.id ? chatAPI.Endpoints.Task.List(experimentInfo.id) : null,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: false },
  );

  const {
    data: jobsRaw,
    isLoading: jobsLoading,
    mutate: jobsMutate,
  } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.GetJobsOfType(experimentInfo.id, 'REMOTE', '')
      : null,
    fetcher,
    {
      refreshInterval: 3000,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshWhenHidden: true,
      refreshWhenOffline: false,
    },
  );

  const tasksForExperiment = useMemo(() => {
    const list = Array.isArray(allTemplates)
      ? allTemplates
      : (allTemplates?.data ?? []);
    return (list as any[]).filter(
      (t) => t.experiment_id === experimentInfo?.id,
    );
  }, [allTemplates, experimentInfo?.id]);

  const sidebarTasks = useMemo(() => {
    const currentIsInteractive = task ? isInteractiveTemplate(task) : false;
    return tasksForExperiment.filter(
      (t) => isInteractiveTemplate(t) === currentIsInteractive,
    );
  }, [tasksForExperiment, task]);

  const runCountByTaskId = useMemo(() => {
    const all = Array.isArray(jobsRaw) ? jobsRaw : [];
    const out: Record<string, number> = {};
    for (const t of sidebarTasks) {
      out[t.id] = all.filter((j: any) => jobBelongsToTask(j, t)).length;
    }
    return out;
  }, [sidebarTasks, jobsRaw]);

  const taskJobs = useMemo(() => {
    if (!task) return [];
    const all = Array.isArray(jobsRaw) ? jobsRaw : [];
    return all.filter((j: any) => jobBelongsToTask(j, task as any));
  }, [task, jobsRaw]);

  const launchProgressByJobId = useMemo(() => {
    const out: Record<
      string,
      { phase?: string; percent?: number; message?: string }
    > = {};
    for (const job of taskJobs as any[]) {
      const lp = job?.job_data?.launch_progress;
      if (lp) out[String(job.id)] = lp;
    }
    return out;
  }, [taskJobs]);

  const goToJob = (jobId: string | undefined, section?: string) => {
    const id = jobId == null ? '' : String(jobId);
    if (!id || id === '-1' || id === 'NaN') return;
    const suffix = section ? `?section=${section}` : '';
    navigate(`/experiment/${experimentName}/jobs/${id}${suffix}`);
  };

  const goToJobSection = (section: string) => (jobId: string | undefined) =>
    goToJob(jobId, section);

  const copyPermalink = () => {
    navigator.clipboard
      .writeText(
        window.location.href.split('#')[0] +
          generateTaskRunsPermalink(experimentName, taskId),
      )
      // eslint-disable-next-line no-console
      .catch((err) => console.error('Failed to copy permalink:', err));
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!experimentInfo?.id) return;
    const target = (taskJobs as any[]).find(
      (j) => String(j.id) === String(jobId),
    );
    if (!target || !isDeletableJobRecordStatus(target.status)) {
      addNotification({
        type: 'warning',
        message:
          'You can only delete jobs that have not started yet or have finished. Stop the job first if it is still running.',
      });
      return;
    }
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this job?')) return;
    try {
      const response = await fetchWithAuth(
        chatAPI.Endpoints.Jobs.Delete(experimentInfo.id, jobId),
        { method: 'DELETE' },
      );
      if (response.ok) {
        addNotification({ type: 'success', message: 'Job deleted.' });
        await jobsMutate();
      } else {
        addNotification({
          type: 'danger',
          message: 'Failed to delete job.',
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete job', err);
      addNotification({ type: 'danger', message: 'Failed to delete job.' });
    }
  };

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

  if (taskError || (!taskLoading && !task)) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography level="h4" color="danger">
          Task not found
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

  const taskName = (task as any)?.title || (task as any)?.name || taskId;
  const taskType = (task as any)?.type;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          gap: 1,
        }}
      >
        <Tooltip title={`Back to ${experimentName} tasks`}>
          <IconButton
            size="sm"
            variant="plain"
            onClick={() => navigate(`/experiment/${experimentName}/tasks`)}
          >
            <ArrowLeftIcon size={16} />
          </IconButton>
        </Tooltip>
        <Typography level="title-sm" sx={{ color: 'text.secondary' }}>
          {experimentName}
        </Typography>
        <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>
          /
        </Typography>
        <Typography level="title-sm">{taskName}</Typography>
        {taskType && (
          <Chip size="sm" color="primary" variant="soft">
            {taskType}
          </Chip>
        )}
        <Chip size="sm" variant="soft" color="neutral">
          {jobsLoading && taskJobs.length === 0
            ? '…'
            : `${taskJobs.length} run${taskJobs.length === 1 ? '' : 's'}`}
        </Chip>
        <Tooltip title="Copy permalink">
          <IconButton
            size="sm"
            variant="plain"
            color="neutral"
            onClick={copyPermalink}
          >
            <LinkIcon size={14} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Body: sidebar (tasks) + content (jobs) */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Box
          sx={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            overflowY: 'auto',
            bgcolor: 'background.level1',
          }}
        >
          <Typography
            level="body-xs"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'text.tertiary',
              px: 2,
              pt: 2,
              pb: 1,
            }}
          >
            Tasks
          </Typography>
          <List size="sm" sx={{ py: 0 }}>
            {sidebarTasks.map((t) => {
              const label = t.title?.trim() || t.name;
              const count = runCountByTaskId[t.id] ?? 0;
              const isActive = String(t.id) === String(taskId);
              return (
                <ListItem key={t.id}>
                  <ListItemButton
                    selected={isActive}
                    onClick={() =>
                      navigate(
                        `/experiment/${experimentName}/tasks/${t.id}/runs`,
                      )
                    }
                    sx={{ display: 'flex', justifyContent: 'space-between' }}
                  >
                    <Typography
                      level="body-sm"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {label}
                    </Typography>
                    <Chip size="sm" variant="soft" color="neutral">
                      {count}
                    </Chip>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {taskJobs.length === 0 && !jobsLoading ? (
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              No runs yet for this task.
            </Typography>
          ) : (
            <JobsList
              jobs={taskJobs}
              launchProgressByJobId={launchProgressByJobId}
              onDeleteJob={handleDeleteJob}
              onViewOutput={goToJobSection('logs')}
              onViewCheckpoints={goToJobSection('checkpoints')}
              onViewAllArtifacts={goToJobSection('artifacts')}
              onViewEvalImages={goToJobSection('artifacts')}
              onViewEvalResults={goToJobSection('evalResults')}
              onViewSweepOutput={goToJobSection('logs')}
              onViewSweepResults={goToJobSection('sweepResults')}
              onViewInteractive={goToJobSection('logs')}
              onViewTrackio={goToJob}
              loading={jobsLoading && taskJobs.length === 0}
              hideJobId={false}
              showFilesButton={false}
              forceArtifactsButtonVisible
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
