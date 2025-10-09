import React, { useState } from 'react';
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

const tasksList = [
  {
    id: '1',
    name: 'Task 1',
    description: 'Description for Task 1',
    type: 'training',
    datasets: ['dataset1'],
    config: JSON.stringify({}),
    created: dayjs().subtract(1, 'day').toISOString(),
    updated: dayjs().subtract(1, 'hour').toISOString(),
  },
  {
    id: '2',
    name: 'Task 2',
    description: 'Description for Task 2',
    type: 'training',
    datasets: ['dataset2'],
    config: JSON.stringify({}),
    created: dayjs().subtract(2, 'days').toISOString(),
    updated: dayjs().subtract(2, 'hours').toISOString(),
  },
];

const jobs = [
  { id: 1, status: 'queued', job_data: { config: { name: 'Job 1' } } },
  { id: 2, status: 'running', job_data: { config: { name: 'Job 2' } } },
  { id: 3, status: 'completed', job_data: { config: { name: 'Job 3' } } },
];

export default function Tasks() {
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { experimentInfo } = useExperimentInfo();

  const handleOpen = () => setModalOpen(true);
  const handleClose = () => setModalOpen(false);

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
        chatAPI.Endpoints.Jobs.LaunchRemote(),
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
        <TaskTemplateList tasksList={tasksList} />
      </Sheet>
      <Typography level="title-md">Runs</Typography>
      <Sheet sx={{ px: 1, mt: 1, mb: 2, flex: 2, overflow: 'auto' }}>
        <JobsList jobs={jobs} />
      </Sheet>
    </Sheet>
  );
}
