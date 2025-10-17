/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemContent from '@mui/joy/ListItemContent';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import IconButton from '@mui/joy/IconButton';
import Button from '@mui/joy/Button';
import { useMemo, useState } from 'react';
import {
  RectangleVerticalIcon,
  Edit2,
  Trash2,
  Plus,
  FilePlus,
} from 'lucide-react';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import TaskModal from './TaskModal';
import NewTaskModal from './NewTaskModal';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import Chip from '@mui/joy/Chip';

export default function TaskLibrary({}) {
  const { experimentInfo } = useExperimentInfo();

  const { data: localGalleryResp } = useSWR(
    chatAPI.getAPIFullPath('tasks', ['localGallery'], {}),
    chatAPI.fetcher
  );
  const { data: remoteGalleryResp } = useSWR(
    chatAPI.getAPIFullPath('tasks', ['gallery'], {}),
    chatAPI.fetcher
  );

  // local overlay for create/edit/delete without waiting for refetch
  const [overlayTasks, setOverlayTasks] = useState<any[]>([]);

  const tasks = useMemo(() => {
    const localGallery: any[] = localGalleryResp?.data ?? [];
    const remoteGallery: any[] = remoteGalleryResp?.data ?? [];

    const localGalleryMapped = localGallery.map((g: any) => ({
      id: `local:${g.subdir || g.id || g.name}`,
      title: g.name || g.title || g.task_name || 'Task',
      description: g.description || '',
      _isLocal: true,
      _subdir: g.subdir,
    }));

    const remoteGalleryMapped = remoteGallery.map((g: any) => ({
      id: `gallery:${g.subdir || g.id || g.name}`,
      title: g.name || g.title || g.task_name || 'Task',
      description: g.description || '',
      _isGallery: true,
      _subdir: g.subdir,
    }));

    return [...localGalleryMapped, ...remoteGalleryMapped, ...overlayTasks];
  }, [localGalleryResp, remoteGalleryResp, overlayTasks]);

  // modal state to show TaskModal when creating/viewing a task
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState<any | null>(null);
  // modal state for new task creation
  const [newTaskModalOpen, setNewTaskModalOpen] = useState(false);

  const handleCloseModal = () => {
    setModalOpen(false);
    setModalTask(null);
  };

  const handleImportFromGallery = async (subdir: string) => {
    const url = chatAPI.getAPIFullPath('tasks', ['importFromGallery'], {});
    const form = new URLSearchParams();
    form.set('subdir', subdir);
    // experimentId optional; if available in context add it
    if (experimentInfo?.id) form.set('experiment_id', experimentInfo.id);
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      credentials: 'include',
    });
  };

  const handleCreate = () => {
    // open new task modal for importing from REMOTE tasks
    setNewTaskModalOpen(true);
  };

  const handleNewTaskSuccess = () => {
    // Refresh the local gallery data
    // The SWR will automatically refetch
  };

  const handleEdit = (taskId: string) => {
    // find the task and open the modal populated for editing
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    setModalTask(t);
    setModalOpen(true);
  };

  // save handler for both new and edited tasks
  const handleSave = (savedTask: any) => {
    setOverlayTasks((prev) => {
      const exists = prev.some((t) => t.id === savedTask.id);
      if (exists) return prev.map((t) => (t.id === savedTask.id ? savedTask : t));
      return [savedTask, ...prev];
    });
    setModalOpen(false);
    setModalTask(null);
  };

  const handleDelete = (taskId: string) => {
    if (!window.confirm('Delete this task?')) return;
    setOverlayTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  return (
    <Sheet sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.5,
        }}
      >
        <h2 style={{ margin: 0 }}>Task Library</h2>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {/* Removed Import Example button; gallery shows inline */}

          <Button
            size="sm"
            variant="solid"
            onClick={handleCreate}
            aria-label="Create new task"
            startDecorator={<Plus size={14} />}
          >
            New Task
          </Button>
        </Box>
      </Box>
      <List
        sx={{
          overflow: 'auto',
          gap: 1,
          pt: 2,
        }}
      >
        {tasks.map((task: any) => (
          <ListItem
            key={task.id}
            sx={{
              alignItems: 'flex-start',
              display: 'flex',
              gap: 1,
              padding: 2,
            }}
            variant="outlined"
          >
            <ListItemDecorator sx={{ mt: '4px' }}>
              <RectangleVerticalIcon />
            </ListItemDecorator>

            <ListItemContent sx={{ minWidth: 0 }}>
              <Typography fontWeight="lg">{task.title || task.name}</Typography>
              <Typography level="body-sm" textColor="text.tertiary">
                {task.description}
              </Typography>
              {task._isLocal && (
                <Box sx={{ mt: 0.5 }}>
                  <Chip size="sm" color="success" variant="soft">
                    Local
                  </Chip>
                </Box>
              )}
              {task._isGallery && (
                <Box sx={{ mt: 0.5 }}>
                  <Chip size="sm" color="primary" variant="soft">
                    Gallery
                  </Chip>
                </Box>
              )}
            </ListItemContent>

            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                alignItems: 'center',
                ml: 'auto',
                alignSelf: 'start',
              }}
            >
              {!task._isGallery && !task._isLocal && (
              <IconButton
                size="sm"
                variant="plain"
                color="neutral"
                aria-label={`Edit ${task.title}`}
                onClick={() => handleEdit(task.id)}
              >
                <Edit2 size={16} />
              </IconButton>
              )}

              {!task._isGallery && !task._isLocal && (
              <IconButton
                size="sm"
                variant="plain"
                color="danger"
                aria-label={`Delete ${task.title}`}
                onClick={() => handleDelete(task.id)}
              >
                <Trash2 size={16} />
              </IconButton>
              )}

              {task._isGallery && (
                <Button
                  size="sm"
                  variant="outlined"
                  onClick={() => handleImportFromGallery(task._subdir || task.id.split(':')[1])}
                  startDecorator={<FilePlus size={12} />}
                >
                  Import
                </Button>
              )}
            </Box>
          </ListItem>
        ))}
      </List>

      {/* Task modal for create/view */}
      <TaskModal
        open={modalOpen}
        onClose={handleCloseModal}
        task={modalTask}
        onSave={handleSave}
      />
      {/* New task modal for importing from REMOTE tasks */}
      <NewTaskModal
        open={newTaskModalOpen}
        onClose={() => setNewTaskModalOpen(false)}
        onSuccess={handleNewTaskSuccess}
      />
      {/* Gallery modal removed; items shown inline in list */}
    </Sheet>
  );
}
