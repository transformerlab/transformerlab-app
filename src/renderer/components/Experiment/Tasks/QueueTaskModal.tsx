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
  Select,
  Option,
  IconButton,
  Stack,
  Typography,
  Divider,
} from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import { Trash2Icon, PlayIcon } from 'lucide-react';
import { setTheme } from 'renderer/lib/monacoConfig';

type QueueTaskModalProps = {
  open: boolean;
  onClose: () => void;
  task: any;
  onSubmit: (parameters: Record<string, any>) => void;
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
            } else if (typeof value === 'boolean' || typeof value === 'number') {
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

        setParameters(
          parametersArray.length > 0
            ? parametersArray
            : [{ key: '', value: '', valueType: 'string' }],
        );
      } else {
        setParameters([{ key: '', value: '', valueType: 'string' }]);
      }
    }
  }, [open, task]);

  const handleSubmit = () => {
    // Convert parameters array to object, parsing JSON values
    const parametersObj: Record<string, any> = {};
    parameters.forEach(({ key, value, valueType }) => {
      if (key.trim() && value.trim()) {
        try {
          if (valueType === 'json') {
            // Parse JSON value
            parametersObj[key.trim()] = JSON.parse(value);
          } else {
            // Try to parse as number or boolean, otherwise keep as string
            const trimmedValue = value.trim();
            if (trimmedValue === 'true') {
              parametersObj[key.trim()] = true;
            } else if (trimmedValue === 'false') {
              parametersObj[key.trim()] = false;
            } else if (trimmedValue === 'null') {
              parametersObj[key.trim()] = null;
            } else if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
              parametersObj[key.trim()] = Number(trimmedValue);
            } else {
              parametersObj[key.trim()] = trimmedValue;
            }
          }
        } catch (e) {
          // If JSON parsing fails, treat as string
          parametersObj[key.trim()] = value.trim();
        }
      }
    });

    onSubmit(parametersObj);
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
            <Typography level="body-sm">
              Customize the parameter values for this task execution. These
              values will override the defaults defined in the task template.
            </Typography>

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
                <FormLabel>Parameters</FormLabel>
                <Stack spacing={1}>
                  {parameters.map((param, index) => (
                    <Stack key={index} spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Input
                          placeholder="Parameter name (e.g., learning_rate)"
                          value={param.key}
                          onChange={(e) => {
                            const newParams = [...parameters];
                            newParams[index].key = e.target.value;

                            // If user is typing in the last row and it's becoming non-empty,
                            // automatically append a new blank row
                            const isLast = index === newParams.length - 1;
                            const hasContent =
                              newParams[index].key.trim() ||
                              newParams[index].value.trim();
                            if (isLast && hasContent) {
                              newParams.push({
                                key: '',
                                value: '',
                                valueType: 'string',
                              });
                            }
                            setParameters(newParams);
                          }}
                          sx={{ flex: 1 }}
                        />
                        <Select
                          value={param.valueType}
                          onChange={(_, newValue) => {
                            if (newValue) {
                              const newParams = [...parameters];
                              newParams[index].valueType = newValue;
                              setParameters(newParams);
                            }
                          }}
                          sx={{ minWidth: 100 }}
                        >
                          <Option value="string">String</Option>
                          <Option value="json">JSON</Option>
                        </Select>
                        <IconButton
                          color="danger"
                          variant="plain"
                          onClick={() => {
                            if (parameters.length > 1) {
                              setParameters(
                                parameters.filter((_, i) => i !== index),
                              );
                            } else {
                              setParameters([
                                { key: '', value: '', valueType: 'string' },
                              ]);
                            }
                          }}
                        >
                          <Trash2Icon size={16} />
                        </IconButton>
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

                            // Auto-add new row when typing in last row
                            const isLast = index === newParams.length - 1;
                            const hasContent =
                              newParams[index].key.trim() ||
                              newParams[index].value.trim();
                            if (isLast && hasContent) {
                              newParams.push({
                                key: '',
                                value: '',
                                valueType: 'string',
                              });
                            }
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
