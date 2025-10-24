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
import LocalTasksList from 'renderer/components/Experiment/Tasks/LocalTasksList';
import GalleryTasksList from 'renderer/components/Experiment/Tasks/GalleryTasksList';

export default function TasksGallery() {
  const [activeTab, setActiveTab] = useState(0);
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
    }
  };

  const handleImportToExperiment = async (subdir: string) => {
    if (!experimentInfo?.id) return;

    try {
      const formData = new FormData();
      formData.append('subdir', subdir);
      formData.append('experiment_id', experimentInfo.id);

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

  const handleDeleteLocalTask = async (subdir: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this local task?')) {
      return;
    }

    try {
      // For now, we'll need to implement a delete endpoint
      // This would delete the task from workspace/tasks-gallery/
      addNotification({
        type: 'info',
        message: 'Delete functionality not yet implemented',
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to delete task. Please try again.',
      });
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
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
        sx={{ mb: 2 }}
      >
        <Typography level="title-md">Tasks Gallery</Typography>
        <Stack direction="row" gap={1}>
          <Button
            startDecorator={<PlusIcon />}
            onClick={() => setActiveTab(0)}
            variant={activeTab === 0 ? 'solid' : 'outlined'}
            size="sm"
          >
            Local Tasks
          </Button>
          <Button
            startDecorator={<DownloadIcon />}
            onClick={() => setActiveTab(1)}
            variant={activeTab === 1 ? 'solid' : 'outlined'}
            size="sm"
          >
            Gallery
          </Button>
        </Stack>
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
          />
        </TabPanel>

        <TabPanel value={1} sx={{ flex: 1, overflow: 'auto' }}>
          <GalleryTasksList
            tasks={galleryTasks?.data || []}
            isLoading={galleryTasksIsLoading}
            onInstall={handleInstallFromGallery}
          />
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
