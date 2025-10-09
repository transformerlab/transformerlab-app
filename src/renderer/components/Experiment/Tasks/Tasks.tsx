import React, { useState, useEffect, useCallback } from 'react';
import Sheet from '@mui/joy/Sheet';

import { Button, Stack, Typography } from '@mui/joy';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PlusIcon } from 'lucide-react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import TaskTemplateList from './TaskTemplateList';
import JobsList from './JobsList';
import NewTaskModal from './NewTaskModal';

const duration = require('dayjs/plugin/duration');

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function Tasks() {
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const { experimentInfo } = useExperimentInfo();

  const handleOpen = () => setModalOpen(true);
  const handleClose = () => setModalOpen(false);

  const fetchTasks = async () => {
    if (!experimentInfo?.id) return;

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.List()
      );
      const data = await response.json();

      // Filter for remote tasks in this experiment only
      const remoteTasks = data.filter((task: any) =>
        task.remote_task === true && task.experiment_id === experimentInfo.id
      );
      setTasks(remoteTasks);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchJobs = async () => {
    if (!experimentInfo?.id) return;

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.GetJobsOfType(experimentInfo.id, 'REMOTE', '')
      );
      const data = await response.json();
      setJobs(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error fetching jobs:', error);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchTasks(), fetchJobs()]);
    setLoading(false);
  }, [experimentInfo?.id]);

  useEffect(() => {
    if (experimentInfo?.id) {
      fetchData();
    }
  }, [experimentInfo?.id, fetchData]);

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
        await fetchData();
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
        await fetchData();
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
      // Prepare form data for the API call
      const formData = new FormData();
      formData.append('experimentId', experimentInfo.id);
      formData.append('cluster_name', data.cluster_name);
      formData.append('command', data.command);

      // Add optional parameters if they exist
      if (data.cpus) formData.append('cpus', data.cpus);
      if (data.memory) formData.append('memory', data.memory);
      if (data.disk_space) formData.append('disk_space', data.disk_space);
      if (data.accelerators) formData.append('accelerators', data.accelerators);
      if (data.num_nodes)
        formData.append('num_nodes', data.num_nodes.toString());
      if (data.setup) formData.append('setup', data.setup);

      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.LaunchRemote(experimentInfo.id),
        {
          method: 'POST',
          body: formData,
        },
      );

      const result = await response.json();

          if (result.status === 'success') {
            // eslint-disable-next-line no-alert
            alert('Task launched successfully!');
            setModalOpen(false);
            // Refresh the data to show the new task and job
            await fetchData();
          } else {
            // eslint-disable-next-line no-alert
            alert(`Error: ${result.message}`);
          }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error launching task:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to launch task. Please try again.');
    } finally {
      setIsSubmitting(false);
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
              <Typography>Loading tasks...</Typography>
            ) : (
              <TaskTemplateList tasksList={tasks} onDeleteTask={handleDeleteTask} />
            )}
          </Sheet>
          <Typography level="title-md">Runs</Typography>
          <Sheet sx={{ px: 1, mt: 1, mb: 2, flex: 2, overflow: 'auto' }}>
            {loading ? (
              <Typography>Loading jobs...</Typography>
            ) : (
              <JobsList jobs={jobs} onDeleteJob={handleDeleteJob} />
            )}
          </Sheet>
    </Sheet>
  );
}
