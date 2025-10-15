import React, { useState, useCallback } from 'react';
import Sheet from '@mui/joy/Sheet';

import { Button, LinearProgress, Stack, Typography } from '@mui/joy';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PlusIcon } from 'lucide-react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import TaskTemplateList from './TaskTemplateList';
import JobsList from './JobsList';
import NewTaskModal from './NewTaskModal';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';

const duration = require('dayjs/plugin/duration');

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function Tasks() {
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewOutputFromJob, setViewOutputFromJob] = useState(-1);
  const [currentTensorboardForModal, setCurrentTensorboardForModal] =
    useState(-1);
  const [viewCheckpointsFromJob, setViewCheckpointsFromJob] = useState(-1);
  const [viewEvalImagesFromJob, setViewEvalImagesFromJob] = useState(-1);
  const [viewOutputFromSweepJob, setViewOutputFromSweepJob] = useState(false);
  const { experimentInfo } = useExperimentInfo();

  const handleOpen = () => setModalOpen(true);
  const handleClose = () => setModalOpen(false);

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

  const loading = tasksIsLoading || jobsIsLoading;

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
        // eslint-disable-next-line no-alert
        alert('Task deleted successfully!');
        // Refresh the data to remove the deleted task
        await tasksMutate();
      } else {
        // eslint-disable-next-line no-alert
        alert('Failed to delete task. Please try again.');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting task:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to delete task. Please try again.');
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
        // eslint-disable-next-line no-alert
        alert('Job deleted successfully!');
        // Refresh the data to remove the deleted job
        await jobsMutate();
      } else {
        // eslint-disable-next-line no-alert
        alert('Failed to delete job. Please try again.');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting job:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to delete job. Please try again.');
    }
  };

  const handleSubmit = async (data: any) => {
    if (!experimentInfo?.id) {
      // eslint-disable-next-line no-alert
      alert('No experiment selected');
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
        // eslint-disable-next-line no-alert
        alert('Task created. Use Queue to launch remotely.');
      } else {
        const txt = await response.text();
        // eslint-disable-next-line no-alert
        alert(`Failed to create task: ${txt}`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating task:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to create task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQueue = async (task: any) => {
    if (!experimentInfo?.id) return;

    try {
      const cfg = typeof task.config === 'string' ? JSON.parse(task.config) : task.config || {};
      const formData = new FormData();
      formData.append('experimentId', experimentInfo.id);
      if (cfg.cluster_name) formData.append('cluster_name', cfg.cluster_name);
      if (cfg.command) formData.append('command', cfg.command);
      // Prefer the task name as job/task name
      if (task.name) formData.append('task_name', task.name);
      if (cfg.cpus) formData.append('cpus', String(cfg.cpus));
      if (cfg.memory) formData.append('memory', String(cfg.memory));
      if (cfg.disk_space) formData.append('disk_space', String(cfg.disk_space));
      if (cfg.accelerators) formData.append('accelerators', String(cfg.accelerators));
      if (cfg.num_nodes) formData.append('num_nodes', String(cfg.num_nodes));
      if (cfg.setup) formData.append('setup', String(cfg.setup));

      const resp = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.LaunchRemote(experimentInfo.id),
        { method: 'POST', body: formData },
      );
      const result = await resp.json();
      if (result.status === 'success') {
        // eslint-disable-next-line no-alert
        alert('Task queued for remote launch.');
        await Promise.all([jobsMutate(), tasksMutate()]);
      } else {
        // eslint-disable-next-line no-alert
        alert(`Remote launch failed: ${result.message}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      // eslint-disable-next-line no-alert
      alert('Failed to queue remote task.');
    }
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
        {loading ? (
          <LinearProgress />
        ) : (
          <TaskTemplateList
            tasksList={tasks}
            onDeleteTask={handleDeleteTask}
            onQueueTask={handleQueue}
          />
        )}
      </Sheet>
      <Typography level="title-md">Runs</Typography>
      <Sheet sx={{ px: 1, mt: 1, mb: 2, flex: 2, overflow: 'auto' }}>
        {loading ? (
          <LinearProgress />
        ) : (
          <JobsList
            jobs={jobs}
            onDeleteJob={handleDeleteJob}
            onViewOutput={(jobId) => setViewOutputFromJob(parseInt(jobId))}
            onViewTensorboard={(jobId) =>
              setCurrentTensorboardForModal(parseInt(jobId))
            }
            onViewCheckpoints={(jobId) =>
              setViewCheckpointsFromJob(parseInt(jobId))
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
    </Sheet>
  );
}
