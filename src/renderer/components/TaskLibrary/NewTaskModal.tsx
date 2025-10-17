import React, { useState } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Select,
  Option,
  Typography,
  Box,
  Alert,
} from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import { useAPI } from 'renderer/lib/api-client/hooks';

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewTaskModal({
  open,
  onClose,
  onSuccess,
}: NewTaskModalProps) {
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [tag, setTag] = useState('OTHER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { addNotification } = useNotification();

  // Fetch existing REMOTE tasks
  const { data: remoteTasksResp } = useAPI('tasks', ['getAll'], {});

  const remoteTasks = Array.isArray(remoteTasksResp)
    ? remoteTasksResp.filter((task: any) => task.remote_task === true)
    : [];

  const handleSubmit = async () => {
    if (!taskName.trim() || !description.trim() || !selectedTaskId) {
      setError('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const url = chatAPI.getAPIFullPath('tasks', ['importToLocalGallery'], {});
      const form = new URLSearchParams();
      form.set('task_name', taskName.trim());
      form.set('description', description.trim());
      form.set('source_task_id', selectedTaskId);
      form.set('tag', tag);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        credentials: 'include',
      });

      const result = await response.json();

      if (result.status === 'success') {
        addNotification({
          type: 'success',
          message: `Task "${taskName}" successfully exported to local gallery!`,
        });
        onSuccess?.();
        onClose();
        setTaskName('');
        setDescription('');
        setSelectedTaskId('');
        setTag('OTHER');
      } else {
        setError(result.message || 'Failed to create task');
      }
    } catch (err) {
      addNotification({
        type: 'danger',
        message: `Failed to export task: ${err}`,
      });
      setError('Network error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTaskName('');
    setDescription('');
    setSelectedTaskId('');
    setTag('OTHER');
    setError('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ maxWidth: 500 }}>
        <ModalClose />
        <DialogTitle>Create New Task</DialogTitle>

        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl>
              <FormLabel>Task Name</FormLabel>
              <Input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="Enter task name"
                required
              />
            </FormControl>

            <FormControl>
              <FormLabel>Description</FormLabel>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter task description"
                minRows={3}
                required
              />
            </FormControl>

            <FormControl>
              <FormLabel>Import from REMOTE Task</FormLabel>
              <Select
                value={selectedTaskId}
                onChange={(_, value) => setSelectedTaskId(value || '')}
                placeholder="Select a REMOTE task to import"
                required
              >
                {remoteTasks.map((task: any) => (
                  <Option key={task.id} value={task.id}>
                    {task.name} - {task.description || 'No description'}
                  </Option>
                ))}
              </Select>
              {remoteTasks.length === 0 && (
                <Typography level="body-sm" color="neutral">
                  No REMOTE tasks available. Create a REMOTE task first.
                </Typography>
              )}
            </FormControl>

            <FormControl>
              <FormLabel>Tag</FormLabel>
              <Select
                value={tag}
                onChange={(_, value) => setTag(value || 'OTHER')}
                required
              >
                <Option value="TRAIN">TRAIN</Option>
                <Option value="EVAL">EVAL</Option>
                <Option value="OTHER">OTHER</Option>
              </Select>
            </FormControl>

            {error && <Alert color="danger">{error}</Alert>}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button variant="plain" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={
              !taskName.trim() ||
              !description.trim() ||
              !selectedTaskId ||
              remoteTasks.length === 0
            }
          >
            Create Task
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
