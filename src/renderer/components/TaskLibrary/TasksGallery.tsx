import { useState } from 'react';
import { Button, Sheet, Stack, Typography } from '@mui/joy';
import { PlusIcon } from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import GalleryTasksList from 'renderer/components/TaskLibrary/GalleryTasksList';
import TaskFilesModal from 'renderer/components/TaskLibrary/TaskFilesModal';
import NewTaskModal from 'renderer/components/TaskLibrary/NewTaskModal';

export default function TasksGallery() {
  const [installingTasks, setInstallingTasks] = useState<Set<string>>(
    new Set(),
  );
  const [filesModalOpen, setFilesModalOpen] = useState(false);
  const [selectedTaskName, setSelectedTaskName] = useState('');
  const [selectedTaskDir, setSelectedTaskDir] = useState('');
  const [taskFiles, setTaskFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [newTaskModalOpen, setNewTaskModalOpen] = useState(false);

  // Fetch remote gallery tasks
  const { data: galleryTasks, isLoading: galleryTasksIsLoading } = useSWR(
    chatAPI.Endpoints.Tasks.Gallery(),
    fetcher,
  );

  const handleInstallFromGallery = async () => {};

  const handleCloseFilesModal = () => {
    setFilesModalOpen(false);
    setSelectedTaskName('');
    setSelectedTaskDir('');
    setTaskFiles([]);
  };

  const handleExportTask = () => {
    setNewTaskModalOpen(true);
  };

  const handleCloseExportModal = () => {
    setNewTaskModalOpen(false);
  };

  const handleTaskExported = async () => {};

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
        sx={{ mb: 2 }}
      >
        <Typography level="h2">Tasks Gallery</Typography>
        <Button
          startDecorator={<PlusIcon />}
          onClick={handleExportTask}
          size="sm"
        >
          New Task
        </Button>
      </Stack>

      <GalleryTasksList
        tasks={galleryTasks?.data || []}
        isLoading={galleryTasksIsLoading}
        onInstall={handleInstallFromGallery}
        installingTasks={installingTasks}
      />

      <TaskFilesModal
        open={filesModalOpen}
        onClose={handleCloseFilesModal}
        taskName={selectedTaskName}
        taskDir={selectedTaskDir}
        files={taskFiles}
        isLoading={filesLoading}
      />

      <NewTaskModal
        open={newTaskModalOpen}
        onClose={handleCloseExportModal}
        onSuccess={handleTaskExported}
      />
    </Sheet>
  );
}
