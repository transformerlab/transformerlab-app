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
  const [mode, setMode] = useState('TRAIN');
  const [availableTasks, setAvailableTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [validationError, setValidationError] = useState('');

  const { data: tasksData } = useSWR(
    open && mode !== 'OTHER' && mode !== 'DOWNLOAD_MODEL'
      ? chatAPI.Endpoints.Tasks.ListByTypeInExperiment(mode, experimentInfo.id)
      : null,
    fetcher,
  );

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setMode(newValue);
    setSelectedTask(''); // Reset task selection when mode changes
    setValidationError(''); // Clear validation errors
    // No need to manually filter since API does it for us
    setAvailableTasks([]);
  };

  useEffect(() => {
    if (
      tasksData &&
      mode !== 'OTHER' &&
      mode !== 'DOWNLOAD_MODEL' &&
      tasksData?.detail !== 'Not Found'
    ) {
      // Tasks are already filtered by type and experiment from the API
      setAvailableTasks(Array.isArray(tasksData) ? tasksData : ([] as any));
    } else {
      setAvailableTasks([]);
    }
  }, [tasksData, mode]);

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog sx={{ maxWidth: 500, width: '90vw' }}>
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
              const selectedTaskObj: any = availableTasks.find(
                (task: any) => (task.id || task.name) === selectedTask,
              );
              const selectedTaskName = selectedTaskObj?.name || selectedTask;

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
                <Radio value="EXPORT" label="EXPORT" />
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
                      width: '100%',
                      minWidth: 0, // Allow shrinking below content width
                    }}
                  >
                    {availableTasks.map((task: any) => (
                      <ListItem key={task.id || task.name} sx={{ p: 0 }}>
                        <ListItemButton
                          selected={selectedTask === (task.id || task.name)}
                          onClick={() => {
                            setSelectedTask(task.id || task.name);
                            setValidationError('');
                          }}
                          sx={{
                            width: '100%',
                            minWidth: 0, // Allow shrinking
                            px: 2,
                            py: 1,
                          }}
                        >
                          <Typography
                            sx={{
                              wordBreak: 'break-word',
                              whiteSpace: 'normal',
                              lineHeight: 1.3,
                              width: '100%',
                            }}
                            title={task.name} // Show full name on hover
                          >
                            {task.name}
                          </Typography>
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
