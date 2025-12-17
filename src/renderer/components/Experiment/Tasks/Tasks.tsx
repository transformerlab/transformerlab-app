import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';

import { Button, LinearProgress, Stack, Typography } from '@mui/joy';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PlusIcon } from 'lucide-react';
import { useSWRWithAuth as useSWR, useAPI } from 'renderer/lib/authContext';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import TaskTemplateList from './TaskTemplateList';
import JobsList from './JobsList';
import NewTaskModal from './NewTaskModal';
import EditTaskModal from './EditTaskModal';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';
import ViewArtifactsModal from '../Train/ViewArtifactsModal';
import ViewCheckpointsModal from '../Train/ViewCheckpointsModal';
import ViewEvalResultsModal from './ViewEvalResultsModal';
import PreviewDatasetModal from '../../Data/PreviewDatasetModal';
import ViewSweepResultsModal from './ViewSweepResultsModal';

const duration = require('dayjs/plugin/duration');

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function Tasks({ subtype }: { subtype?: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [taskBeingEdited, setTaskBeingEdited] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewOutputFromJob, setViewOutputFromJob] = useState(-1);
  const [currentTensorboardForModal, setCurrentTensorboardForModal] =
    useState(-1);
  const [viewCheckpointsFromJob, setViewCheckpointsFromJob] = useState(-1);
  const [viewArtifactsFromJob, setViewArtifactsFromJob] = useState(-1);
  const [viewEvalImagesFromJob, setViewEvalImagesFromJob] = useState(-1);
  const [viewOutputFromSweepJob, setViewOutputFromSweepJob] = useState(false);
  const [viewSweepResultsFromJob, setViewSweepResultsFromJob] = useState(-1);
  const [viewEvalResultsFromJob, setViewEvalResultsFromJob] = useState(-1);
  const [previewDatasetModal, setPreviewDatasetModal] = useState<{
    open: boolean;
    datasetId: string | null;
  }>({ open: false, datasetId: null });
  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();
  const { fetchWithAuth, team } = useAuth();

  // Trigger to force re-render when localStorage changes (minimal state to avoid interfering with useSWR)
  const [pendingIdsTrigger, setPendingIdsTrigger] = useState(0);

  const {
    data: providerListData,
    error: providerListError,
    isLoading: providersIsLoading,
  } = useAPI('compute_provider', ['list'], { teamId: team?.id ?? null });

  const providers = useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  useEffect(() => {
    if (providerListError) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch providers', providerListError);
    }
  }, [providerListError]);

  // Pending job IDs persisted per experiment to show immediate placeholders
  const pendingJobsStorageKey = useMemo(
    () =>
      experimentInfo?.id
        ? `pendingJobIds:${String(experimentInfo.id)}`
        : 'pendingJobIds:unknown',
    [experimentInfo?.id],
  );

  const getPendingJobIds = useCallback((): string[] => {
    try {
      const raw = window.localStorage.getItem(pendingJobsStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const result = Array.isArray(parsed) ? parsed : [];
      return result;
    } catch {
      return [];
    }
  }, [pendingJobsStorageKey]);

  const setPendingJobIds = useCallback(
    (ids: string[]) => {
      try {
        window.localStorage.setItem(pendingJobsStorageKey, JSON.stringify(ids));
        // Trigger re-render by updating counter
        setPendingIdsTrigger((prev) => prev + 1);
      } catch {
        // ignore storage failures
      }
    },
    [pendingJobsStorageKey],
  );

  // Listen for localStorage changes to pick up pending job IDs from other tabs/windows
  // Using storage event to avoid interfering with useSWR polling
  useEffect(() => {
    // Listen for storage events (works across tabs/windows)
    // Note: storage event only fires for changes from OTHER tabs, not same tab
    // Same-tab changes are handled by setPendingJobIds which updates trigger directly
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === pendingJobsStorageKey) {
        // Trigger re-render by updating counter
        setPendingIdsTrigger((prev) => prev + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pendingJobsStorageKey]);

  const handleOpen = () => setModalOpen(true);
  const handleClose = () => setModalOpen(false);
  const handleEditClose = () => {
    setEditModalOpen(false);
    setTaskBeingEdited(null);
  };

  // Fetch REMOTE jobs with automatic polling
  const {
    data: jobsRemote,
    isError: jobsIsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(
    experimentInfo?.id
      ? subtype
        ? chatAPI.Endpoints.Jobs.ListWithFilters(
            experimentInfo.id,
            'REMOTE',
            '',
            subtype,
          )
        : chatAPI.Endpoints.Jobs.GetJobsOfType(experimentInfo.id, 'REMOTE', '')
      : null,
    fetcher,
    {
      refreshInterval: 3000, // Poll every 3 seconds for job status updates
      revalidateOnFocus: false, // Don't refetch when window regains focus
      revalidateOnReconnect: true, // Refetch when network reconnects
      refreshWhenHidden: true, // Continue polling even when tab is hidden
      refreshWhenOffline: false, // Don't poll when offline
    },
  );

  // Also fetch SWEEP jobs (parent sweep jobs)
  const { data: jobsSweep, mutate: jobsSweepMutate } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.GetJobsOfType(experimentInfo.id, 'SWEEP', '')
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

  // Combine REMOTE and SWEEP jobs (SWEEP jobs first)
  const jobs = useMemo(() => {
    const remoteJobs = Array.isArray(jobsRemote) ? jobsRemote : [];
    const sweepJobs = Array.isArray(jobsSweep) ? jobsSweep : [];
    return [...sweepJobs, ...remoteJobs];
  }, [jobsRemote, jobsSweep]);

  // Fetch tasks with useSWR
  const {
    data: allTasks,
    isError: tasksIsError,
    isLoading: tasksIsLoading,
    mutate: tasksMutate,
  } = useSWR(
    experimentInfo?.id
      ? subtype
        ? chatAPI.Endpoints.Tasks.ListBySubtypeInExperiment(
            experimentInfo.id,
            subtype,
            true,
          )
        : chatAPI.Endpoints.Tasks.List()
      : null,
    fetcher,
  );

  // Filter tasks for remote tasks in this experiment only
  // If subtype is provided, filter by subtype in task config
  const tasks =
    (Array.isArray(allTasks) ? allTasks : allTasks?.data || []) // in case API returns {data: []}
      ?.filter(
        (task: any) =>
          task.remote_task === true &&
          task.experiment_id === experimentInfo?.id,
      ) || [];

  // Check each LAUNCHING job individually via provider endpoints
  useEffect(() => {
    if (!jobs || !Array.isArray(jobs)) return;

    const launchingJobs = jobs.filter(
      (job: any) =>
        job.type === 'REMOTE' &&
        job.status === 'LAUNCHING' &&
        job.job_data?.provider_id, // Only check jobs with provider_id
    );

    if (launchingJobs.length === 0) return;

    // Check each job individually
    const checkJobs = async () => {
      for (const job of launchingJobs) {
        try {
          const response = await fetchWithAuth(
            chatAPI.Endpoints.ComputeProvider.CheckJobStatus(String(job.id)),
            { method: 'GET' },
          );
          if (response.ok) {
            const result = await response.json();
            // If job was updated to COMPLETE, refresh jobs list
            if (result.updated && result.new_status === 'COMPLETE') {
              setTimeout(() => jobsMutate(), 0);
            }
          }
        } catch (error) {
          // Silently ignore errors for individual job checks
          console.error(`Failed to check job ${job.id}:`, error);
        }
      }
    };

    // Check immediately and then every 10 seconds
    checkJobs();
    const interval = setInterval(checkJobs, 10000);

    return () => clearInterval(interval);
  }, [jobs, fetchWithAuth, jobsMutate]);

  // Check SWEEP jobs status to update progress
  useEffect(() => {
    if (!jobs || !Array.isArray(jobs)) return;

    const runningSweepJobs = jobs.filter(
      (job: any) =>
        (job.type === 'SWEEP' || job.job_data?.sweep_parent) &&
        (job.status === 'RUNNING' || job.status === 'LAUNCHING'),
    );

    if (runningSweepJobs.length === 0) return;

    // Check each sweep job status
    const checkSweepJobs = async () => {
      for (const job of runningSweepJobs) {
        try {
          const response = await fetchWithAuth(
            chatAPI.Endpoints.ComputeProvider.CheckSweepStatus(String(job.id)),
            { method: 'GET' },
          );
          if (response.ok) {
            const result = await response.json();
            // Refresh jobs list to get updated progress
            if (result.status === 'success') {
              setTimeout(() => {
                jobsMutate();
                jobsSweepMutate();
              }, 0);
            }
          }
        } catch (error) {
          // Silently ignore errors for individual sweep job checks
          console.error(`Failed to check sweep job ${job.id}:`, error);
        }
      }
    };

    // Check immediately and then every 10 seconds
    checkSweepJobs();
    const interval = setInterval(checkSweepJobs, 10000);

    return () => clearInterval(interval);
  }, [jobs, fetchWithAuth, jobsMutate]);

  const loading = tasksIsLoading || jobsIsLoading;

  // Remove any pending placeholders that are now present in jobs
  useEffect(() => {
    if (!jobs || !Array.isArray(jobs)) return;
    const pending = getPendingJobIds();
    if (pending.length === 0) return;
    const existingIds = new Set((jobs as any[]).map((j: any) => String(j.id)));
    const stillPending = pending.filter((id) => !existingIds.has(String(id)));
    if (stillPending.length !== pending.length) {
      setPendingJobIds(stillPending);
    }
  }, [jobs, getPendingJobIds, setPendingJobIds]);

  // Build list with placeholders for pending job IDs not yet in jobs
  // If subtype is provided, filter jobs by subtype in job_data
  const jobsWithPlaceholders = useMemo(() => {
    const baseJobs = Array.isArray(jobs) ? jobs : [];
    let filteredJobs = baseJobs;

    // Filter by subtype if provided
    if (subtype) {
      filteredJobs = baseJobs.filter((job: any) => {
        const jobData = job.job_data || {};
        return jobData.subtype === subtype;
      });
    }

    // Read directly from localStorage to avoid state dependency issues
    // The pendingIdsTrigger ensures this recalculates when localStorage changes
    const pending = getPendingJobIds();

    if (!pending.length) return filteredJobs;

    // Check against ALL jobs (not just filtered) to see if pending IDs exist
    // This ensures placeholders are removed once the job appears in the API response,
    // regardless of whether it matches the current subtype filter
    const allExistingIds = new Set(baseJobs.map((j: any) => String(j.id)));

    // Create placeholders for pending IDs that don't exist in the full jobs list yet
    const placeholders = pending
      .filter((id) => !allExistingIds.has(String(id)))
      .map((id) => ({
        id: String(id),
        type: 'REMOTE',
        status: 'CREATED',
        progress: 0,
        job_data: subtype ? { subtype } : {},
        placeholder: true,
      }));

    // Show newest first consistent with existing ordering if any
    const combined = [...placeholders, ...filteredJobs];
    return combined;
  }, [jobs, getPendingJobIds, subtype, pendingIdsTrigger]);

  const handleDeleteTask = async (taskId: string) => {
    if (!experimentInfo?.id) return;

    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.DeleteTask(taskId),
        {
          method: 'GET',
        },
      );

      if (response.ok) {
        addNotification({
          type: 'success',
          message: 'Task deleted successfully!',
        });
        // Refresh the data to remove the deleted task
        await tasksMutate();
      } else {
        addNotification({
          type: 'danger',
          message: 'Failed to delete task. Please try again.',
        });
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to delete task. Please try again.',
      });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!experimentInfo?.id) return;

    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.Delete(experimentInfo.id, jobId),
        {
          method: 'GET',
        },
      );

      if (response.ok) {
        addNotification({
          type: 'success',
          message: 'Job deleted successfully!',
        });
        // Refresh the data to remove the deleted job
        await jobsMutate();
      } else {
        addNotification({
          type: 'danger',
          message: 'Failed to delete job. Please try again.',
        });
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to delete job. Please try again.',
      });
    }
  };

  const handleExportToTeamGallery = async (taskId: string) => {
    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.ExportToTeamGallery(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ task_id: taskId }),
        },
      );

      if (!response.ok) {
        const txt = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to export task: ${txt}`,
        });
        return;
      }

      const result = await response.json();
      addNotification({
        type: 'success',
        message: result?.message || 'Task exported to team gallery.',
      });
    } catch (error) {
      console.error('Error exporting task:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to export task. Please try again.',
      });
    }
  };

  const handleSubmit = async (data: any) => {
    if (!experimentInfo?.id) {
      addNotification({ type: 'warning', message: 'No experiment selected' });
      return;
    }

    if (!data.provider_id) {
      addNotification({
        type: 'warning',
        message: 'Select a provider before creating a task.',
      });
      return;
    }

    const providerMeta = providers.find(
      (provider) => provider.id === data.provider_id,
    );

    if (!providerMeta) {
      addNotification({
        type: 'danger',
        message:
          'Selected provider is unavailable. Please refresh or choose another provider.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Create a remote task template first
      const config: any = {
        cluster_name: data.cluster_name,
        command: data.command,
        cpus: data.cpus || undefined,
        memory: data.memory || undefined,
        disk_space: data.disk_space || undefined,
        accelerators: data.accelerators || undefined,
        num_nodes: data.num_nodes || undefined,
        setup: data.setup || undefined,
        env_vars: data.env_vars || undefined,
        parameters: data.parameters || undefined,
        file_mounts: data.file_mounts || undefined,
        github_enabled: data.github_enabled || undefined,
        github_repo_url: data.github_repo_url || undefined,
        github_directory: data.github_directory || undefined,
        run_sweeps: data.run_sweeps || undefined,
        sweep_config: data.sweep_config || undefined,
        sweep_metric:
          data.sweep_metric || (data.run_sweeps ? 'eval/loss' : undefined),
        lower_is_better:
          data.lower_is_better !== undefined ? data.lower_is_better : undefined,
      };

      config.provider_id = providerMeta.id;
      config.provider_name = providerMeta.name;

      // Add subtype to config if provided
      if (subtype) {
        config.subtype = subtype;
      }

      const payload = {
        name: data.title,
        type: 'REMOTE',
        inputs: {},
        config: config,
        plugin: 'remote_orchestrator',
        outputs: {},
        experiment_id: experimentInfo.id,
        remote_task: true,
      } as any;

      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.NewTask(),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        setModalOpen(false);
        await tasksMutate();
        addNotification({
          type: 'success',
          message: 'Task created. Use Queue to launch remotely.',
        });
      } else {
        const txt = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to create task: ${txt}`,
        });
      }
    } catch (error) {
      console.error('Error creating task:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to create task. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQueue = async (task: any) => {
    if (!experimentInfo?.id) return;

    const cfg =
      typeof task.config === 'string'
        ? JSON.parse(task.config)
        : task.config || {};

    const providerId =
      cfg.provider_id || (providers.length ? providers[0]?.id : null);
    if (!providerId) {
      addNotification({
        type: 'danger',
        message:
          'No providers available. Add a provider in the team settings first.',
      });
      return;
    }

    const providerMeta = providers.find(
      (provider) => provider.id === providerId,
    );

    if (!providerMeta) {
      addNotification({
        type: 'danger',
        message:
          'Selected provider is unavailable. Please create or update providers in team settings.',
      });
      return;
    }

    if (!cfg.command) {
      addNotification({
        type: 'warning',
        message: 'Task is missing a command to run.',
      });
      return;
    }

    addNotification({
      type: 'success',
      message: 'Launching provider job...',
    });

    try {
      const payload = {
        experiment_id: experimentInfo.id,
        task_name: task.name,
        cluster_name: cfg.cluster_name,
        command: cfg.command,
        subtype: cfg.subtype,
        cpus: cfg.cpus,
        memory: cfg.memory,
        disk_space: cfg.disk_space,
        accelerators: cfg.accelerators,
        num_nodes: cfg.num_nodes,
        setup: cfg.setup,
        env_vars: cfg.env_vars || {},
        parameters: cfg.parameters || undefined,
        file_mounts: cfg.file_mounts,
        provider_name: providerMeta.name,
        github_enabled: cfg.github_enabled,
        github_repo_url: cfg.github_repo_url,
        github_directory: cfg.github_directory,
        run_sweeps: cfg.run_sweeps || undefined,
        sweep_config: cfg.sweep_config || undefined,
        sweep_metric:
          cfg.sweep_metric || (cfg.run_sweeps ? 'eval/loss' : undefined),
        lower_is_better:
          cfg.lower_is_better !== undefined ? cfg.lower_is_better : undefined,
      };

      const response = await fetchWithAuth(
        chatAPI.Endpoints.ComputeProvider.LaunchTask(providerId),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      let launchResult: any = {};
      try {
        launchResult = await response.json();
      } catch {
        launchResult = {};
      }

      if (response.ok && launchResult?.status === 'success') {
        const newId = String(launchResult.job_id);
        const pending = getPendingJobIds();
        if (!pending.includes(newId)) {
          setPendingJobIds([newId, ...pending]);
        }
        setTimeout(() => jobsMutate(), 0);

        addNotification({
          type: 'success',
          message: 'Provider cluster launch initiated.',
        });
        await Promise.all([jobsMutate(), tasksMutate()]);
      } else {
        const message =
          launchResult?.message || 'Failed to queue provider-backed task.';
        addNotification({
          type: 'danger',
          message,
        });
      }
    } catch (e) {
      console.error(e);
      addNotification({
        type: 'danger',
        message: 'Failed to queue provider-backed task.',
      });
    }
  };

  const handleEditTask = (task: any) => {
    setTaskBeingEdited(task);
    setEditModalOpen(true);
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <NewTaskModal
        open={modalOpen}
        onClose={handleClose}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        providers={providers}
        isProvidersLoading={providersIsLoading}
      />
      <EditTaskModal
        open={editModalOpen}
        onClose={handleEditClose}
        task={taskBeingEdited}
        providers={providers}
        isProvidersLoading={providersIsLoading}
        onSaved={async () => {
          await tasksMutate();
        }}
      />
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
      >
        <Typography level="title-md">Task Templates</Typography>
        <Button startDecorator={<PlusIcon />} onClick={handleOpen}>
          New
        </Button>
      </Stack>
      <Sheet
        variant="soft"
        sx={{
          px: 1,
          mt: 1,
          mb: 2,
          flex: 1,
          height: '100%',
          overflow: 'auto',
        }}
      >
        {tasksIsLoading ? (
          <LinearProgress />
        ) : (
          <TaskTemplateList
            tasksList={tasks}
            onDeleteTask={handleDeleteTask}
            onQueueTask={handleQueue}
            onEditTask={handleEditTask}
            onExportTask={handleExportToTeamGallery}
          />
        )}
      </Sheet>
      <Typography level="title-md">Runs</Typography>
      <Sheet sx={{ px: 1, mt: 1, mb: 2, flex: 2, overflow: 'auto' }}>
        {jobsIsLoading ? (
          <LinearProgress />
        ) : (
          <JobsList
            jobs={jobsWithPlaceholders as any}
            onDeleteJob={handleDeleteJob}
            onViewOutput={(jobId) => setViewOutputFromJob(parseInt(jobId))}
            onViewTensorboard={(jobId) =>
              setCurrentTensorboardForModal(parseInt(jobId))
            }
            onViewCheckpoints={(jobId) =>
              setViewCheckpointsFromJob(parseInt(jobId))
            }
            onViewArtifacts={(jobId) =>
              setViewArtifactsFromJob(parseInt(jobId))
            }
            onViewEvalImages={(jobId) =>
              setViewEvalImagesFromJob(parseInt(jobId))
            }
            onViewEvalResults={(jobId) =>
              setViewEvalResultsFromJob(parseInt(jobId))
            }
            onViewGeneratedDataset={(jobId, datasetId) => {
              setPreviewDatasetModal({ open: true, datasetId });
            }}
            onViewSweepOutput={(jobId) => {
              setViewOutputFromSweepJob(true);
              setViewOutputFromJob(parseInt(jobId));
            }}
            onViewSweepResults={(jobId) => {
              setViewSweepResultsFromJob(parseInt(jobId));
            }}
          />
        )}
      </Sheet>
      <ViewSweepResultsModal
        jobId={viewSweepResultsFromJob}
        setJobId={(jobId: number) => setViewSweepResultsFromJob(jobId)}
      />
      <ViewOutputModalStreaming
        jobId={viewOutputFromJob}
        setJobId={(jobId: number) => setViewOutputFromJob(jobId)}
      />
      <ViewArtifactsModal
        open={viewArtifactsFromJob !== -1}
        onClose={() => setViewArtifactsFromJob(-1)}
        jobId={viewArtifactsFromJob}
      />
      <ViewCheckpointsModal
        open={viewCheckpointsFromJob !== -1}
        onClose={() => setViewCheckpointsFromJob(-1)}
        jobId={viewCheckpointsFromJob}
      />
      <ViewEvalResultsModal
        open={viewEvalResultsFromJob !== -1}
        onClose={() => setViewEvalResultsFromJob(-1)}
        jobId={viewEvalResultsFromJob}
      />
      <PreviewDatasetModal
        open={previewDatasetModal.open}
        setOpen={(open: boolean) =>
          setPreviewDatasetModal({ ...previewDatasetModal, open })
        }
        dataset_id={previewDatasetModal.datasetId}
        viewType="preview"
      />
    </Sheet>
  );
}
