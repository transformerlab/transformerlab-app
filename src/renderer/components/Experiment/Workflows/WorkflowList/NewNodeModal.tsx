import {
    Button,
    DialogContent,
    DialogTitle,
    FormControl,
    FormHelperText,
    FormLabel,
    Input,
    Modal,
    ModalClose,
    ModalDialog,
    Option,
    Select,
    Stack,
    Textarea,
  } from '@mui/joy';
  import { useState, useEffect } from 'react';
  
  import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
  import useSWR from 'swr';
  import { node } from 'webpack';
  
  const fetcher = (url: any) => fetch(url).then((res) => res.json());
  
  interface Task {
    id: string;
    name: string;
    type: string;
  }
  
  interface NewNodeModalProps {
    open: boolean;
    onClose: () => void;
    selectedWorkflow: any;
    experimentInfo: {
      id: string;
      name: string;
      config?: {
        evaluations?: string;
      };
    };
    mutateWorkflows: () => void;
    mutateWorkflowDetails: () => void;
  }
  
  export default function NewNodeModal({
    open,
    onClose,
    selectedWorkflow,
    experimentInfo,
    mutateWorkflows,
    mutateWorkflowDetails,
  }: NewNodeModalProps) {
    const [mode, setMode] = useState('OTHER');
    const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  
    const {
      data: tasksData,
      error: tasksError,
      isLoading: isLoadingTasks,
    } = useSWR<Task[]>(open ? chatAPI.Endpoints.Tasks.List() : null, fetcher);
  
    let evaluationData = [];
    try {
      evaluationData = JSON.parse(experimentInfo?.config?.evaluations || '[]');
    } catch (error) {
      console.error('Failed to parse evaluation data:', error);
    }
  
    const handleModeChange = (
      _event: React.MouseEvent<Element, MouseEvent> | React.KeyboardEvent<Element> | React.FocusEvent<Element, Element> | null,
      value: string | null
    ) => {
      if (!value) return;
      setMode(value);
      if (tasksData && value !== 'OTHER') {
        setAvailableTasks(tasksData.filter((task: Task) => task.type === value));
      } else {
        setAvailableTasks([]);
      }
    };
  
    useEffect(() => {
      if (tasksData && mode !== 'OTHER') {
        setAvailableTasks(tasksData.filter((task: Task) => task.type === mode));
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
  
              if (mode === 'OTHER') {
                const node = JSON.parse(formData.get('node') as string);
                node.name = name;
                await fetch(
                  chatAPI.Endpoints.Workflows.AddNode(
                    selectedWorkflow.id,
                    JSON.stringify(node),
                  ),
                );
              } else if (mode === 'DOWNLOAD_MODEL') {
                const model = formData.get('model') as string;
                const config = JSON.parse(selectedWorkflow.config);
                console.log(config);
                const node = {
                  name: name,
                  type: 'DOWNLOAD_MODEL',
                  model: model,
                };
                await fetch(
                  chatAPI.Endpoints.Workflows.AddNode(
                    selectedWorkflow.id,
                    JSON.stringify(node),
                  ),
                );
              } else {
                const selectedTaskName = formData.get('task') as string;
  
                const node = {
                  name: name,
                  task: selectedTaskName,
                  type: mode,
                  metadata: { task_name: selectedTaskName },
                };
                await fetch(
                  chatAPI.Endpoints.Workflows.AddNode(
                    selectedWorkflow.id,
                    JSON.stringify(node),
                  ),
                );
              }
  
              mutateWorkflows();
              mutateWorkflowDetails();
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
                <Select
                  value={mode}
                  onChange={handleModeChange}
                  required
                >
                  <Option value="DOWNLOAD_MODEL">DOWNLOAD MODEL</Option>
                  <Option value="TRAIN">TRAIN</Option>
                  <Option value="EVAL">EVAL</Option>
                  <Option value="GENERATE">GENERATE</Option>
                  <Option value="OTHER">OTHER</Option>
                </Select>
              </FormControl>
  
              <FormControl>
                {mode !== 'OTHER' && mode !== 'DOWNLOAD_MODEL' && (
                  <>
                    <FormLabel>Task</FormLabel>
                    <Select name="task" required>
                      {availableTasks.map((task) => (
                        <Option key={task.id} value={task.name}>
                          {task.name}
                        </Option>
                      ))}
                    </Select>
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