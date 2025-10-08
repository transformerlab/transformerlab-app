import React, { useState } from 'react';
import Sheet from '@mui/joy/Sheet';

import { Button, Stack, Typography } from '@mui/joy';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PlusIcon } from 'lucide-react';
import TaskTemplateList from './TaskTemplateList';
import JobsList from './JobsList';
import NewTaskModal from './NewTaskModal';

var duration = require('dayjs/plugin/duration');
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

  const handleOpen = () => setModalOpen(true);
  const handleClose = () => setModalOpen(false);
  const handleSubmit = (data: any) => {
    alert(`Submitted: ${JSON.stringify(data)}`);
    setModalOpen(false);
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
