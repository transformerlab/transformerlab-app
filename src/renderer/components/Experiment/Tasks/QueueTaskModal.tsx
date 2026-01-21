import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import {
  FormHelperText,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
  Divider,
} from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import { PlayIcon } from 'lucide-react';
import { setTheme } from 'renderer/lib/monacoConfig';

type QueueTaskModalProps = {
  open: boolean;
  onClose: () => void;
  task: any;
  onSubmit: (parameterOverrides: Record<string, any>) => void;
  isSubmitting?: boolean;
};

export default function QueueTaskModal({
  open,
  onClose,
  task,
  onSubmit,
  isSubmitting = false,
}: QueueTaskModalProps) {
  const [parameters, setParameters] = React.useState<
    Array<{ key: string; value: string; valueType: 'string' | 'json' }>
  >([]);

  // Initialize parameters from task when modal opens
  React.useEffect(() => {
    if (open && task) {
      // Extract parameters from task
      const cfg =
        task.config !== undefined
          ? typeof task.config === 'string'
            ? JSON.parse(task.config)
            : task.config
          : task;

      const taskParameters = cfg.parameters || task.parameters || {};

      // Convert parameters object to array format
      if (typeof taskParameters === 'object' && taskParameters !== null) {
        const parametersArray = Object.entries(taskParameters).map(
          ([key, value]) => {
            // Determine value type based on actual value
            let valueType: 'string' | 'json' = 'string';
            let stringValue = '';

            if (
              typeof value === 'object' &&
              value !== null &&
              !Array.isArray(value)
            ) {
              valueType = 'json';
              stringValue = JSON.stringify(value, null, 2);
            } else if (Array.isArray(value)) {
              valueType = 'json';
              stringValue = JSON.stringify(value, null, 2);
            } else if (
              typeof value === 'boolean' ||
              typeof value === 'number'
            ) {
              valueType = 'string';
              stringValue = String(value);
            } else {
              valueType = 'string';
              stringValue = String(value);
            }

            return {
              key,
              value: stringValue,
              valueType,
            };
          },
        );

        setParameters(parametersArray);
      } else {
        setParameters([]);
      }
    }
  }, [open, task]);

  const handleSubmit = () => {
    // Convert parameters array to object for overrides
    // Only include values that are different from defaults or explicitly set
    const parameterOverrides: Record<string, any> = {};
    parameters.forEach(({ key, value, valueType }) => {
      if (key.trim() && value.trim()) {
        try {
          if (valueType === 'json') {
            // Parse JSON value
            parameterOverrides[key.trim()] = JSON.parse(value);
          } else {
            // Try to parse as number or boolean, otherwise keep as string
            const trimmedValue = value.trim();
            if (trimmedValue === 'true') {
              parameterOverrides[key.trim()] = true;
            } else if (trimmedValue === 'false') {
              parameterOverrides[key.trim()] = false;
            } else if (trimmedValue === 'null') {
              parameterOverrides[key.trim()] = null;
            } else if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
              parameterOverrides[key.trim()] = Number(trimmedValue);
            } else {
              parameterOverrides[key.trim()] = trimmedValue;
            }
          }
        } catch (e) {
          // If JSON parsing fails, treat as string
          parameterOverrides[key.trim()] = value.trim();
        }
      }
    });

    onSubmit(parameterOverrides);
  };

  const getTaskTitle = () => {
    if (task?.title && task.title.trim() !== '') {
      return task.title;
    }
    return task?.name || 'Task';
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: 700,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <DialogTitle>Queue Task: {getTaskTitle()}</DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2}>
            {parameters.length === 0 ||
            (parameters.length === 1 &&
              !parameters[0].key &&
              !parameters[0].value) ? (
              <Typography level="body-sm" color="neutral">
                This task has no parameters defined. Click Submit to queue with
                default configuration.
              </Typography>
            ) : (
              <FormControl>
                <FormLabel>Parameter Overrides</FormLabel>
                <Stack spacing={1}>
                  {parameters.map((param, index) => (
                    <Stack key={index} spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Input
                          placeholder="Parameter name"
                          value={param.key}
                          readOnly
                          disabled
                          sx={{ flex: 1, opacity: 0.8 }}
                        />
                      </Stack>
                      {param.valueType === 'json' ? (
                        <Editor
                          height="120px"
                          defaultLanguage="json"
                          value={param.value}
                          onChange={(value) => {
                            const newParams = [...parameters];
                            newParams[index].value = value || '';
                            setParameters(newParams);
                          }}
                          theme="my-theme"
                          onMount={setTheme}
                          options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 12,
                            lineNumbers: 'off',
                            wordWrap: 'on',
                          }}
                        />
                      ) : (
                        <Input
                          placeholder="Value (e.g., 0.001, true, false, or any string)"
                          value={param.value}
                          onChange={(e) => {
                            const newParams = [...parameters];
                            newParams[index].value = e.target.value;
                            setParameters(newParams);
                          }}
                        />
                      )}
                    </Stack>
                  ))}
                </Stack>
                <FormHelperText>
                  Parameters can be accessed in your task script using{' '}
                  <code>lab.get_config()</code>
                </FormHelperText>
              </FormControl>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button
            startDecorator={<PlayIcon />}
            color="success"
            onClick={handleSubmit}
            loading={isSubmitting}
          >
            Submit
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
