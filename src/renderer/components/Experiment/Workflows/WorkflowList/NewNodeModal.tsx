import React, { useState, useEffect, useCallback } from 'react';
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
  Option,
  Select,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

type NodeType = 'DOWNLOAD_MODEL' | 'TRAIN' | 'EVAL' | 'GENERATE' | 'OTHER';

interface NewNodeModalProps {
  open: boolean;
  onClose: () => void;
  selectedWorkflow: {
    id: string;
    config: string;
  };
  experimentInfo: {
    id: string;
  };
}

export default function NewNodeModal({
  open,
  onClose,
  selectedWorkflow,
  experimentInfo,
}: NewNodeModalProps) {
  const [nodeType, setNodeType] = useState<NodeType>('OTHER');
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [nodeName, setNodeName] = useState<string>('');
  const [modelId, setModelId] = useState<string>('');
  const [nodeConfig, setNodeConfig] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const {
    data: tasksData,
    error: tasksError,
    isLoading: isLoadingTasks,
  } = chatAPI.useAPI('tasks', ['getAll'], {}, { pause: !open });

  // Filter tasks based on selected node type
  const availableTasks = React.useMemo(() => {
    if (!tasksData || nodeType === 'OTHER' || nodeType === 'DOWNLOAD_MODEL') {
      return [];
    }
    return tasksData.filter((task: any) => task.type === nodeType);
  }, [tasksData, nodeType]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setNodeType('OTHER');
      setSelectedTask('');
      setNodeName('');
      setModelId('');
      setNodeConfig('');
      setIsSubmitting(false);
    }
  }, [open]);

  // Reset task selection when node type changes
  useEffect(() => {
    setSelectedTask('');
  }, [nodeType]);

  const handleNodeTypeChange = useCallback(
    (_event: any, newValue: NodeType | null) => {
      if (newValue) {
        setNodeType(newValue);
      }
    },
    [],
  );

  const handleTaskChange = useCallback(
    (_event: any, newValue: string | null) => {
      setSelectedTask(newValue || '');
    },
    [],
  );

  const createNodePayload = useCallback(() => {
    const baseNode = {
      name: nodeName,
      type: nodeType,
    };

    switch (nodeType) {
      case 'DOWNLOAD_MODEL':
        return {
          ...baseNode,
          model: modelId,
        };
      case 'OTHER':
        try {
          const parsedConfig = JSON.parse(nodeConfig);
          return {
            ...parsedConfig,
            name: nodeName,
          };
        } catch (error) {
          throw new Error('Invalid JSON configuration');
        }
      default:
        return {
          ...baseNode,
          task: selectedTask,
          metadata: { task_name: selectedTask },
        };
    }
  }, [nodeType, nodeName, modelId, nodeConfig, selectedTask]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (isSubmitting) return;

      try {
        setIsSubmitting(true);

        const nodePayload = createNodePayload();

        await fetch(
          chatAPI.Endpoints.Workflows.AddNode(
            selectedWorkflow.id,
            JSON.stringify(nodePayload),
            experimentInfo.id,
          ),
        );

        onClose();
      } catch (error) {
        // Handle error appropriately - you might want to show a toast/notification
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      createNodePayload,
      selectedWorkflow.id,
      experimentInfo.id,
      onClose,
    ],
  );

  const renderTypeSpecificFields = () => {
    switch (nodeType) {
      case 'DOWNLOAD_MODEL':
        return (
          <FormControl>
            <FormLabel>HuggingFace Model ID</FormLabel>
            <Input
              placeholder="e.g., HuggingFaceTB/SmolLM2-135M-Instruct"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              required
            />
          </FormControl>
        );

      case 'OTHER':
        return (
          <FormControl>
            <FormLabel>Node Configuration (JSON)</FormLabel>
            <Textarea
              minRows={4}
              placeholder='{"type": "custom", "config": {...}}'
              value={nodeConfig}
              onChange={(e) => setNodeConfig(e.target.value)}
              required
            />
          </FormControl>
        );

      case 'TRAIN':
      case 'EVAL':
      case 'GENERATE':
        return (
          <FormControl>
            <FormLabel>Task</FormLabel>
            <Select
              placeholder="Select a task..."
              value={selectedTask}
              onChange={handleTaskChange}
              required
              disabled={availableTasks.length === 0}
            >
              {availableTasks.map((task: any) => (
                <Option key={task.id} value={task.name}>
                  {task.name}
                </Option>
              ))}
            </Select>
            {isLoadingTasks && (
              <Typography level="body-sm" sx={{ mt: 1 }}>
                Loading tasks...
              </Typography>
            )}
            {tasksError && (
              <Typography level="body-sm" color="danger" sx={{ mt: 1 }}>
                Failed to load tasks
              </Typography>
            )}
            {!isLoadingTasks && availableTasks.length === 0 && !tasksError && (
              <Typography level="body-sm" color="neutral" sx={{ mt: 1 }}>
                No tasks available for this type
              </Typography>
            )}
          </FormControl>
        );

      default:
        return null;
    }
  };

  return (
    <Modal open={open} onClose={() => !isSubmitting && onClose()}>
      <ModalDialog sx={{ minWidth: 400, maxWidth: 600 }}>
        <ModalClose disabled={isSubmitting} />
        <DialogTitle>Create New Node</DialogTitle>
        <DialogContent>
          Add a new node to the workflow. Choose the type and configure the
          necessary settings.
        </DialogContent>

        <form onSubmit={handleSubmit}>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <FormControl>
              <FormLabel>Node Name</FormLabel>
              <Input
                placeholder="Enter a descriptive name for this node"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                required
                autoFocus
              />
            </FormControl>

            <FormControl>
              <FormLabel>Node Type</FormLabel>
              <Select value={nodeType} onChange={handleNodeTypeChange} required>
                <Option value="DOWNLOAD_MODEL">Download Model</Option>
                <Option value="TRAIN">Train</Option>
                <Option value="EVAL">Evaluate</Option>
                <Option value="GENERATE">Generate</Option>
                <Option value="OTHER">Custom</Option>
              </Select>
            </FormControl>

            {renderTypeSpecificFields()}

            <Stack
              direction="row"
              spacing={2}
              sx={{ justifyContent: 'flex-end', mt: 3 }}
            >
              <Button
                variant="outlined"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                Create Node
              </Button>
            </Stack>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
