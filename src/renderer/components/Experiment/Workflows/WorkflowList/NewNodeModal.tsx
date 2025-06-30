import {
  Button,
  DialogContent,
  DialogTitle,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Radio,
  RadioGroup,
  Stack,
  Textarea,
  Typography,
  List,
  ListItem,
  ListItemButton,
} from '@mui/joy';
import React, { useState, useEffect } from 'react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';

const fetcher = (url: any) => fetch(url).then((res) => res.json());

export default function NewNodeModal({
  open,
  onClose,
  selectedWorkflow,
  experimentInfo,
}) {
  const [mode, setMode] = useState('OTHER');
  const [availableTasks, setAvailableTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [validationError, setValidationError] = useState('');

  const { data: tasksData } = useSWR(
    open ? chatAPI.Endpoints.Tasks.List() : null,
    fetcher,
  );

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setMode(newValue);
    setSelectedTask(''); // Reset task selection when mode changes
    setValidationError(''); // Clear validation errors
    if (tasksData && newValue !== 'OTHER') {
      const filteredTasks = tasksData.filter(
        (task: any) => task.type === newValue,
      );
      setAvailableTasks(filteredTasks);
    } else {
      setAvailableTasks([]);
    }
  };

  useEffect(() => {
    if (tasksData && mode !== 'OTHER' && tasksData?.detail !== 'Not Found') {
      const filteredTasks = tasksData.filter((task: any) => task.type === mode);
      setAvailableTasks(filteredTasks);
    } else {
      setAvailableTasks([]);
    }
  }, [tasksData, mode]);

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>Create new Node</DialogTitle>
        <DialogContent>Add a new node to the workflow.</DialogContent>
        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const name = formData.get('name') as string;

            // Validation for task selection
            if (
              mode !== 'OTHER' &&
              mode !== 'DOWNLOAD_MODEL' &&
              !selectedTask
            ) {
              setValidationError('Please select a task');
              return;
            }

            if (mode === 'OTHER') {
              const nodeData = JSON.parse(formData.get('node') as string);
              nodeData.name = name;
              await fetch(
                chatAPI.Endpoints.Workflows.AddNode(
                  selectedWorkflow.id,
                  JSON.stringify(nodeData),
                  experimentInfo.id,
                ),
              );
            } else if (mode === 'DOWNLOAD_MODEL') {
              const model = formData.get('model') as string;
              const nodeData = {
                name,
                type: 'DOWNLOAD_MODEL',
                model,
              };
              await fetch(
                chatAPI.Endpoints.Workflows.AddNode(
                  selectedWorkflow.id,
                  JSON.stringify(nodeData),
                  experimentInfo.id,
                ),
              );
            } else {
              const selectedTaskName = selectedTask;

              const nodeData = {
                name,
                task: selectedTaskName,
                type: mode,
                metadata: { task_name: selectedTaskName },
              };
              await fetch(
                chatAPI.Endpoints.Workflows.AddNode(
                  selectedWorkflow.id,
                  JSON.stringify(nodeData),
                  experimentInfo.id,
                ),
              );
            }

            onClose();
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Input autoFocus required name="name" />
            </FormControl>
            <FormControl>
              <FormLabel>Type</FormLabel>
              <RadioGroup value={mode} onChange={handleModeChange} name="mode">
                <Radio value="DOWNLOAD_MODEL" label="DOWNLOAD MODEL" />
                <Radio value="TRAIN" label="TRAIN" />
                <Radio value="EVAL" label="EVAL" />
                <Radio value="GENERATE" label="GENERATE" />
                <Radio value="OTHER" label="OTHER" />
              </RadioGroup>
            </FormControl>

            <FormControl>
              {mode !== 'OTHER' && mode !== 'DOWNLOAD_MODEL' && (
                <>
                  <FormLabel>Task</FormLabel>
                  <List
                    sx={{
                      maxHeight: 200,
                      overflow: 'auto',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: 'divider',
                      p: 0,
                    }}
                  >
                    {availableTasks.map((task: any) => (
                      <ListItem key={task.name}>
                        <ListItemButton
                          selected={selectedTask === task.name}
                          onClick={() => {
                            setSelectedTask(task.name);
                            setValidationError('');
                          }}
                        >
                          {task.name}
                        </ListItemButton>
                      </ListItem>
                    ))}
                    {availableTasks.length === 0 && (
                      <ListItem>
                        <Typography level="body-sm" color="neutral">
                          No tasks available for this type
                        </Typography>
                      </ListItem>
                    )}
                  </List>
                  {validationError && (
                    <Typography level="body-sm" color="danger" sx={{ mt: 1 }}>
                      {validationError}
                    </Typography>
                  )}
                </>
              )}
              {mode === 'DOWNLOAD_MODEL' && (
                <>
                  <FormLabel>Huggingface Model Id</FormLabel>
                  <Input autoFocus required name="model" />
                </>
              )}
              {mode === 'OTHER' && (
                <>
                  <FormLabel>Node Configuration (JSON)</FormLabel>
                  <Textarea minRows={4} autoFocus required name="node" />
                </>
              )}
            </FormControl>

            <Button type="submit">Submit</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
