import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';

import { Button, LinearProgress, Stack, Typography } from '@mui/joy';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PlusIcon } from 'lucide-react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import TaskTemplateList from './TaskTemplateList';
import JobsList from './JobsList';
import NewTaskModal from './NewTaskModal';
import EditTaskModal from './EditTaskModal';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';
import ViewArtifactsModal from '../Train/ViewArtifactsModal';
import ViewCheckpointsModal from '../Train/ViewCheckpointsModal';

const duration = require('dayjs/plugin/duration');

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function Tasks() {
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
  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();

  // Pending job IDs persisted per experiment to show immediate placeholders
  const pendingJobsStorageKey = useMemo(
    () =>
      experimentInfo?.id
        ? `pendingJobIds:${String(experimentInfo.id)}`
        : 'pendingJobIds:unknown',
    [experimentInfo?.id],
  );
  useEffect(() => {
    // Debug storage key per experiment
    // eslint-disable-next-line no-console
  }, [pendingJobsStorageKey]);

  const getPendingJobIds = useCallback((): string[] => {
    try {
      const raw = window.localStorage.getItem(pendingJobsStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const result = Array.isArray(parsed) ? parsed : [];
      // eslint-disable-next-line no-console
      return result;
    } catch {
      return [];
    }
  }, [pendingJobsStorageKey]);

  const setPendingJobIds = useCallback(
    (ids: string[]) => {
      try {
        window.localStorage.setItem(pendingJobsStorageKey, JSON.stringify(ids));
        // eslint-disable-next-line no-console
      } catch {
        // ignore storage failures
      }
    },
    [pendingJobsStorageKey],
  );

  const handleOpen = () => setModalOpen(true);
  const handleClose = () => setModalOpen(false);
  const handleEditClose = () => {
    setEditModalOpen(false);
    setTaskBeingEdited(null);
  };

  // Fetch jobs with automatic polling
  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.GetJobsOfType(experimentInfo.id, 'REMOTE', '')
      : null,
    fetcher,
    {
      refreshInterval: 3000, // Poll every 3 seconds for job status updates
      revalidateOnFocus: false, // Don't refetch when window regains focus
      revalidateOnReconnect: true, // Refetch when network reconnects
    },
  );

  // Fetch tasks with useSWR
  const {
    data: allTasks,
    error: tasksError,
    isLoading: tasksIsLoading,
    mutate: tasksMutate,
  } = useSWR(
    experimentInfo?.id ? chatAPI.Endpoints.Tasks.List() : null,
    fetcher,
  );

  // Filter tasks for remote tasks in this experiment only
  const tasks =
    allTasks?.filter(
      (task: any) =>
        task.remote_task === true && task.experiment_id === experimentInfo?.id,
    ) || [];

  // Check remote job status periodically to update LAUNCHING jobs
  const { data: remoteJobStatus } = useSWR(
    '/remote/check-status',
    async (url) => {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.CheckStatus(),
        {
          method: 'GET',
        },
      );
      return response;
    },
    {
      refreshInterval: 10000, // Check every 10 seconds
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );

  const loading = tasksIsLoading || jobsIsLoading;

  // Remove any pending placeholders that are now present in jobs
  useEffect(() => {
    if (!jobs || !Array.isArray(jobs)) return;
    const pending = getPendingJobIds();
    if (pending.length === 0) return;
    const existingIds = new Set((jobs as any[]).map((j: any) => String(j.id)));
    const stillPending = pending.filter((id) => !existingIds.has(String(id)));
    // eslint-disable-next-line no-console
    console.log('[Tasks] prune pending vs jobs', {
      jobsCount: jobs?.length,
      pending,
      stillPending,
    });
    if (stillPending.length !== pending.length) {
      setPendingJobIds(stillPending);
    }
  }, [jobs, getPendingJobIds, setPendingJobIds]);

  // Build list with placeholders for pending job IDs not yet in jobs
  const jobsWithPlaceholders = useMemo(() => {
    const baseJobs = Array.isArray(jobs) ? jobs : [];
    const pending = getPendingJobIds();
    if (!pending.length) return baseJobs;
    const existingIds = new Set(baseJobs.map((j: any) => String(j.id)));
    const placeholders = pending
      .filter((id) => !existingIds.has(String(id)))
      .map((id) => ({
        id: String(id),
        type: 'REMOTE',
        status: 'CREATED',
        progress: 0,
        job_data: {},
        placeholder: true,
      }));
    // Show newest first consistent with existing ordering if any
    const combined = [...placeholders, ...baseJobs];
    return combined;
  }, [jobs, getPendingJobIds]);

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

  const handleSubmit = async (data: any) => {
    if (!experimentInfo?.id) {
      addNotification({ type: 'warning', message: 'No experiment selected' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Create a remote task template first
      const payload = {
        name: data.title,
        type: 'REMOTE',
        inputs: {},
        config: {
          cluster_name: data.cluster_name,
          command: data.command,
          cpus: data.cpus || undefined,
          memory: data.memory || undefined,
          disk_space: data.disk_space || undefined,
          accelerators: data.accelerators || undefined,
          num_nodes: data.num_nodes || undefined,
          setup: data.setup || undefined,
          uploaded_dir_path: data.uploaded_dir_path || undefined,
          local_upload_copy: data.local_upload_copy || undefined,
        },
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

  // Helper function to build FormData for remote job operations
  const buildRemoteJobFormData = (task: any, cfg: any, jobId?: string) => {
    const formData = new FormData();
    formData.append('experimentId', experimentInfo.id);

    if (jobId) {
      formData.append('job_id', jobId);
    }

    if (cfg.cluster_name) formData.append('cluster_name', cfg.cluster_name);
    if (cfg.command) formData.append('command', cfg.command);
    if (task.name) formData.append('task_name', task.name);
    if (cfg.cpus) formData.append('cpus', String(cfg.cpus));
    if (cfg.memory) formData.append('memory', String(cfg.memory));
    if (cfg.disk_space) formData.append('disk_space', String(cfg.disk_space));
    if (cfg.accelerators)
      formData.append('accelerators', String(cfg.accelerators));
    if (cfg.num_nodes) formData.append('num_nodes', String(cfg.num_nodes));
    if (cfg.setup) formData.append('setup', String(cfg.setup));
    if (cfg.uploaded_dir_path)
      formData.append('uploaded_dir_path', String(cfg.uploaded_dir_path));

    return formData;
  };

  const handleQueue = async (task: any) => {
    if (!experimentInfo?.id) return;

    addNotification({
      type: 'success',
      message: 'Creating job...',
    });

    try {
      const cfg =
        typeof task.config === 'string'
          ? JSON.parse(task.config)
          : task.config || {};

      // Create the actual remote job
      const createJobFormData = buildRemoteJobFormData(task, cfg);

      const createJobResp = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.CreateRemoteJob(experimentInfo.id),
        { method: 'POST', body: createJobFormData },
      );
      const createJobResult = await createJobResp.json();

      if (createJobResult.status === 'success') {
        // Persist pending placeholder immediately so it shows up in the UI
        const newId = String(createJobResult.job_id);
        const pending = getPendingJobIds();
        if (!pending.includes(newId)) {
          setPendingJobIds([newId, ...pending]);
        }
        // IMPORTANT: Don't await jobsMutate, let UI update before real jobs arrive
        setTimeout(() => jobsMutate(), 0);

        addNotification({
          type: 'success',
          message: 'Job created. Launching remotely...',
        });

        // Then launch the remote job using the formatted cluster_name from create-job (if provided)
        const formattedClusterName =
          createJobResult.cluster_name || cfg.cluster_name;
        const launchCfg = { ...cfg, cluster_name: formattedClusterName };

        const launchFormData = buildRemoteJobFormData(
          task,
          launchCfg,
          createJobResult.job_id,
        );

        const launchResp = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Jobs.LaunchRemote(experimentInfo.id),
          { method: 'POST', body: launchFormData },
        );
        const launchResult = await launchResp.json();

        if (launchResult.status === 'success') {
          addNotification({
            type: 'success',
            message: 'Task launched remotely.',
          });
          await Promise.all([jobsMutate(), tasksMutate()]);
        } else {
          addNotification({
            type: 'danger',
            message: `Remote launch failed: ${launchResult.message}`,
          });
        }
      } else {
        addNotification({
          type: 'danger',
          message: `Failed to create job: ${createJobResult.message}`,
        });
      }
    } catch (e) {
      console.error(e);
      addNotification({
        type: 'danger',
        message: 'Failed to queue remote task.',
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
      />
      <EditTaskModal
        open={editModalOpen}
        onClose={handleEditClose}
        task={taskBeingEdited}
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
            onViewSweepOutput={(jobId) => {
              setViewOutputFromSweepJob(true);
              setViewOutputFromJob(parseInt(jobId));
            }}
          />
        )}
      </Sheet>
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
    </Sheet>
  );
}
