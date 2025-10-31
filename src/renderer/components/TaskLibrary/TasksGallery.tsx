import React, { useState } from 'react';
import {
  Button,
  Sheet,
  Stack,
  Typography,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy';
import { PlusIcon, DownloadIcon, UploadIcon } from 'lucide-react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import LocalTasksList from 'renderer/components/TaskLibrary/LocalTasksList';
import GalleryTasksList from 'renderer/components/TaskLibrary/GalleryTasksList';
import TaskFilesModal from 'renderer/components/TaskLibrary/TaskFilesModal';
import NewTaskModal from 'renderer/components/TaskLibrary/NewTaskModal';

export default function TasksGallery() {
  const [activeTab, setActiveTab] = useState(0);
  const [installingTasks, setInstallingTasks] = useState<Set<string>>(
    new Set(),
  );
  const [deletingTasks, setDeletingTasks] = useState<Set<string>>(new Set());
  const [filesModalOpen, setFilesModalOpen] = useState(false);
  const [selectedTaskName, setSelectedTaskName] = useState('');
  const [selectedTaskDir, setSelectedTaskDir] = useState('');
  const [taskFiles, setTaskFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [newTaskModalOpen, setNewTaskModalOpen] = useState(false);
  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();

  // Fetch local tasks
  const {
    data: localTasks,
    error: localTasksError,
    isLoading: localTasksIsLoading,
    mutate: localTasksMutate,
  } = useSWR(chatAPI.Endpoints.Tasks.LocalGallery(), fetcher);

  // Fetch remote gallery tasks
  const {
    data: galleryTasks,
    error: galleryTasksError,
    isLoading: galleryTasksIsLoading,
    mutate: galleryTasksMutate,
  } = useSWR(chatAPI.Endpoints.Tasks.Gallery(), fetcher);

  const handleInstallFromGallery = async (id: string) => {
    setInstallingTasks((prev) => new Set(prev).add(id));
    try {
      const formData = new FormData();
      formData.append('id', id);

      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.InstallFromGallery(),
        {
          method: 'POST',
          body: formData,
        },
      );

      const result = await response.json();
      if (result.status === 'success') {
        addNotification({
          type: 'success',
          message: `Task '${result.task_dir}' installed successfully!`,
        });
        await localTasksMutate();
      } else {
        addNotification({
          type: 'danger',
          message: `Failed to install task: ${result.message}`,
        });
      }
    } catch (error) {
      console.error('Error installing task:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to install task. Please try again.',
      });
    } finally {
      setInstallingTasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const handleImportToExperiment = async (taskDir: string) => {
    if (!experimentInfo?.id) return;

    try {
      const formData = new FormData();
      formData.append('task_dir', taskDir);
      formData.append('experiment_id', experimentInfo.id);
      formData.append('upload', 'true');

      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.ImportFromLocalGallery(),
        {
          method: 'POST',
          body: formData,
        },
      );

      const result = await response.json();
      if (result.status === 'success') {
        addNotification({
          type: 'success',
          message: `Task imported to experiment successfully!`,
        });
        // Refresh local tasks to show updated status
        await localTasksMutate();
      } else {
        addNotification({
          type: 'danger',
          message: `Failed to import task: ${result.message}`,
        });
      }
    } catch (error) {
      console.error('Error importing task:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to import task. Please try again.',
      });
    }
  };

  const handleDeleteLocalTask = async (taskDir: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this local task?')) {
      return;
    }

    setDeletingTasks((prev) => new Set(prev).add(taskDir));
    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.DeleteFromLocalGallery(taskDir),
        {
          method: 'DELETE',
        },
      );

      const result = await response.json();
      if (result.status === 'success') {
        addNotification({
          type: 'success',
          message: `Task deleted successfully!`,
        });
        await localTasksMutate();
      } else {
        addNotification({
          type: 'danger',
          message: `Failed to delete task: ${result.message}`,
        });
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to delete task. Please try again.',
      });
    } finally {
      setDeletingTasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(taskDir);
        return newSet;
      });
    }
  };

  const handleShowFiles = async (taskDir: string) => {
    setFilesLoading(true);
    setFilesModalOpen(true);
    setSelectedTaskName(taskDir);
    setSelectedTaskDir(taskDir);

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.GetTaskFiles(taskDir),
        {
          method: 'GET',
        },
      );

      const result = await response.json();
      if (result.status === 'success') {
        setTaskFiles(result.data.files || []);
      } else {
        addNotification({
          type: 'danger',
          message: `Failed to load files: ${result.message}`,
        });
        setTaskFiles([]);
      }
    } catch (error) {
      console.error('Error loading task files:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to load task files. Please try again.',
      });
      setTaskFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

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

  const handleTaskExported = async () => {
    // Refresh local tasks when a task is exported
    await localTasksMutate();
    setNewTaskModalOpen(false);
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
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
        sx={{ mb: 2 }}
      >
        <Typography level="title-md">Tasks Gallery</Typography>
        <Button
          startDecorator={<PlusIcon />}
          onClick={handleExportTask}
          size="sm"
        >
          New Task
        </Button>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={(event, value) => setActiveTab(value as number)}
        sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        <TabList>
          <Tab>Local Tasks ({localTasks?.data?.length || 0})</Tab>
          <Tab>Gallery ({galleryTasks?.data?.length || 0})</Tab>
        </TabList>

        <TabPanel value={0} sx={{ flex: 1, overflow: 'auto' }}>
          <LocalTasksList
            tasks={localTasks?.data || []}
            isLoading={localTasksIsLoading}
            onImport={handleImportToExperiment}
            onDelete={handleDeleteLocalTask}
            onShowFiles={handleShowFiles}
          />
        </TabPanel>

        <TabPanel value={1} sx={{ flex: 1, overflow: 'auto' }}>
          <GalleryTasksList
            tasks={galleryTasks?.data || []}
            isLoading={galleryTasksIsLoading}
            onInstall={handleInstallFromGallery}
            installingTasks={installingTasks}
            localTasks={localTasks?.data || []}
          />
        </TabPanel>
      </Tabs>

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
