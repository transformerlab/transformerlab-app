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
  Slider,
  Switch,
  Radio,
  RadioGroup,
  Select,
  Option,
  Checkbox,
} from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import { PlayIcon } from 'lucide-react';
import { setTheme } from 'renderer/lib/monacoConfig';
import { useSWRWithAuth as useSWR, useAPI } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';

type QueueTaskModalProps = {
  open: boolean;
  onClose: () => void;
  task: any;
  onSubmit: (config: Record<string, any>) => void;
  isSubmitting?: boolean;
};

// Type definitions for parameter schemas
type ParameterType =
  | 'int'
  | 'integer'
  | 'float'
  | 'number'
  | 'bool'
  | 'boolean'
  | 'enum'
  | 'string';
type UIWidgetType =
  | 'slider'
  | 'range'
  | 'switch'
  | 'radio'
  | 'password'
  | 'select'
  | 'lab_model_select'
  | 'lab_dataset_select';

interface ParameterSchema {
  type?: ParameterType;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  enum?: string[];
  ui_widget?: UIWidgetType;
  title?: string;
  required?: boolean;
}

interface ProcessedParameter {
  key: string;
  value: any;
  schema: ParameterSchema | null;
  isShorthand: boolean;
}

export default function QueueTaskModal({
  open,
  onClose,
  task,
  onSubmit,
  isSubmitting = false,
}: QueueTaskModalProps) {
  const { team } = useAuth();
  const [parameters, setParameters] = React.useState<ProcessedParameter[]>([]);
  const [customModelDataset, setCustomModelDataset] = React.useState<
    Set<number>
  >(new Set());
  const [validationErrors, setValidationErrors] = React.useState<
    Record<number, string>
  >({});
  const [selectedProviderId, setSelectedProviderId] = React.useState('');

  // Fetch available models and datasets from the API
  const { data: modelsData } = useSWR(
    open ? chatAPI.Endpoints.Models.LocalList() : null,
    fetcher,
  );
  const { data: datasetsData } = useSWR(
    open ? chatAPI.Endpoints.Dataset.LocalList() : null,
    fetcher,
  );

  // Fetch available providers
  const {
    data: providerListData,
    error: providerListError,
    isLoading: providersIsLoading,
  } = useAPI('compute_provider', ['list'], { teamId: team?.id ?? null });

  const providers = React.useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  React.useEffect(() => {
    if (providerListError) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch providers', providerListError);
    }
  }, [providerListError]);

  const models = modelsData || [];
  const datasets = datasetsData || [];

  // Helper function to parse parameter value and schema
  const parseParameter = (key: string, value: any): ProcessedParameter => {
    // Check if value is a schema object (has type, default, etc.) or shorthand
    const isObject =
      typeof value === 'object' && value !== null && !Array.isArray(value);
    const hasSchemaFields =
      isObject &&
      ('type' in value ||
        'default' in value ||
        'min' in value ||
        'max' in value ||
        'options' in value ||
        'enum' in value);

    if (hasSchemaFields) {
      // Extended schema format
      const schema = value as ParameterSchema;
      return {
        key,
        value: schema.default !== undefined ? schema.default : '',
        schema,
        isShorthand: false,
      };
    } else {
      // Shorthand format - infer type from value
      return {
        key,
        value: value,
        schema: null,
        isShorthand: true,
      };
    }
  };

  // Initialize parameters and provider from task when modal opens
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

      // Convert parameters object to ProcessedParameter array
      if (typeof taskParameters === 'object' && taskParameters !== null) {
        const parametersArray = Object.entries(taskParameters).map(
          ([key, value]) => parseParameter(key, value),
        );

        setParameters(parametersArray);
      } else {
        setParameters([]);
      }

      // Set provider: use task's provider if it exists in current list, else first provider
      const taskProviderId =
        cfg.provider_id ?? task.provider_id ?? '';
      const taskProviderInList = providers.some(
        (p: { id: string }) => p.id === taskProviderId,
      );
      setSelectedProviderId(
        taskProviderInList ? taskProviderId : (providers[0]?.id ?? ''),
      );
    }
  }, [open, task, providers]);

  // Helper function to validate constraints
  const validateParameter = (param: ProcessedParameter): string | null => {
    const { schema, value } = param;
    if (!schema) return null;

    const numValue = Number(value);

    // Check min constraint
    if (schema.min !== undefined && !Number.isNaN(numValue)) {
      if (numValue < schema.min) {
        return `Minimum value is ${schema.min}`;
      }
    }

    // Check max constraint
    if (schema.max !== undefined && !Number.isNaN(numValue)) {
      if (numValue > schema.max) {
        return `Maximum value is ${schema.max}`;
      }
    }

    // Note: step validation is handled by the native HTML input step attribute

    return null;
  };

  // Helper function to check if all parameters are valid
  const validateAllParameters = (): string | null => {
    for (const param of parameters) {
      if (!param.key.trim()) continue;
      const error = validateParameter(param);
      if (error) {
        return `${param.key}: ${error}`;
      }
    }
    return null;
  };

  const handleSubmit = () => {
    // Validate provider selection
    if (!selectedProviderId) {
      alert('Please select a compute provider before submitting');
      return;
    }

    // Validate all parameters
    const validationError = validateAllParameters();
    if (validationError) {
      alert(`Validation error: ${validationError}`);
      return;
    }

    // Convert parameters array to object for config
    const config: Record<string, any> = {};
    parameters.forEach(({ key, value }) => {
      if (key.trim()) {
        config[key.trim()] = value;
      }
    });

    // Add provider_id to the config
    config.provider_id = selectedProviderId;

    // Add provider_name if available
    const provider = providers.find((p) => p.id === selectedProviderId);
    if (provider) {
      config.provider_name = provider.name;
    }

    onSubmit(config);
  };

  const getTaskTitle = () => {
    if (task?.title && task.title.trim() !== '') {
      return task.title;
    }
    return task?.name || 'Task';
  };

  // Helper function to determine the actual type of a parameter
  const getParameterType = (param: ProcessedParameter): ParameterType => {
    if (param.schema?.type) {
      return param.schema.type;
    }
    // Infer type from value for shorthand
    const val = param.value;
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'number') {
      return Number.isInteger(val) ? 'int' : 'float';
    }
    if (Array.isArray(val)) return 'string'; // Will be rendered as JSON editor
    if (typeof val === 'object' && val !== null) return 'string'; // Will be rendered as JSON editor
    return 'string';
  };

  // Helper function to render the appropriate input widget
  const updateParameterAndValidate = (
    newParams: ProcessedParameter[],
    index: number,
  ) => {
    setParameters(newParams);

    // Validate the updated parameter
    const error = validateParameter(newParams[index]);
    const newErrors = { ...validationErrors };
    if (error) {
      newErrors[index] = error;
    } else {
      delete newErrors[index];
    }
    setValidationErrors(newErrors);
  };

  // Helper function to render the appropriate input widget
  const renderParameterInput = (param: ProcessedParameter, index: number) => {
    const schema = param.schema;
    const type = getParameterType(param);
    const uiWidget = schema?.ui_widget;
    const label = schema?.title || param.key;

    // Special handling for 'lab_model_select' widget
    if (uiWidget === 'lab_model_select') {
      const isCustom = customModelDataset.has(index);

      return (
        <Stack direction="column" spacing={1} sx={{ flex: 1 }}>
          {isCustom ? (
            <Input
              placeholder="Enter any model name"
              value={String(param.value)}
              onChange={(e) => {
                const newParams = [...parameters];
                newParams[index].value = e.target.value;
                setParameters(newParams);
              }}
              sx={{ flex: 1 }}
            />
          ) : (
            <Select
              value={String(param.value)}
              onChange={(_, value) => {
                const newParams = [...parameters];
                newParams[index].value = value;
                setParameters(newParams);
              }}
              placeholder="Select a model"
              sx={{ flex: 1 }}
            >
              {models.map((model: any) => (
                <Option key={model.model_id} value={model.model_id}>
                  {model.model_id}
                </Option>
              ))}
            </Select>
          )}
          <Stack direction="row" spacing={1} alignItems="center">
            <Checkbox
              checked={isCustom}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                if (e.target.checked) {
                  const newParams = [...parameters];
                  // Initialize with empty string if value is null/undefined
                  if (
                    newParams[index].value === null ||
                    newParams[index].value === undefined
                  ) {
                    newParams[index].value = '';
                  }
                  setParameters(newParams);
                  setCustomModelDataset(
                    new Set([...customModelDataset, index]),
                  );
                } else {
                  const newSet = new Set(customModelDataset);
                  newSet.delete(index);
                  setCustomModelDataset(newSet);
                }
              }}
              size="sm"
            />
            <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
              Enter any string
            </Typography>
          </Stack>
        </Stack>
      );
    }

    // Special handling for 'lab_dataset_select' widget
    if (uiWidget === 'lab_dataset_select') {
      const isCustom = customModelDataset.has(index);

      return (
        <Stack direction="column" spacing={1} sx={{ flex: 1 }}>
          {isCustom ? (
            <Input
              placeholder="Enter any dataset name"
              value={String(param.value)}
              onChange={(e) => {
                const newParams = [...parameters];
                newParams[index].value = e.target.value;
                setParameters(newParams);
              }}
              sx={{ flex: 1 }}
            />
          ) : (
            <Select
              value={String(param.value)}
              onChange={(_, value) => {
                const newParams = [...parameters];
                newParams[index].value = value;
                setParameters(newParams);
              }}
              placeholder="Select a dataset"
              sx={{ flex: 1 }}
            >
              {datasets.map((dataset: any) => (
                <Option key={dataset.dataset_id} value={dataset.dataset_id}>
                  {dataset.dataset_id}
                </Option>
              ))}
            </Select>
          )}
          <Stack direction="row" spacing={1} alignItems="center">
            <Checkbox
              checked={isCustom}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                if (e.target.checked) {
                  const newParams = [...parameters];
                  // Initialize with empty string if value is null/undefined
                  if (
                    newParams[index].value === null ||
                    newParams[index].value === undefined
                  ) {
                    newParams[index].value = '';
                  }
                  setParameters(newParams);
                  setCustomModelDataset(
                    new Set([...customModelDataset, index]),
                  );
                } else {
                  const newSet = new Set(customModelDataset);
                  newSet.delete(index);
                  setCustomModelDataset(newSet);
                }
              }}
              size="sm"
            />
            <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
              Enter any string
            </Typography>
          </Stack>
        </Stack>
      );
    }

    // Handle different widget types
    // Integer with slider
    if (
      (type === 'int' ||
        type === 'integer' ||
        type === 'float' ||
        type === 'number') &&
      (uiWidget === 'slider' || uiWidget === 'range')
    ) {
      const min = schema?.min ?? 0;
      const max = schema?.max ?? 100;
      const step =
        schema?.step ?? (type === 'int' || type === 'integer' ? 1 : 0.01);

      return (
        <Stack direction="column" spacing={1} sx={{ flex: 1 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Slider
              value={Number(param.value) || min}
              onChange={(_, value) => {
                const newParams = [...parameters];
                newParams[index].value = value;
                updateParameterAndValidate(newParams, index);
              }}
              min={min}
              max={max}
              step={step}
              valueLabelDisplay="auto"
              sx={{ flex: 1 }}
            />
            <Input
              value={param.value}
              onChange={(e) => {
                const newParams = [...parameters];
                const val = e.target.value;
                newParams[index].value = val === '' ? min : Number(val);
                updateParameterAndValidate(newParams, index);
              }}
              type="number"
              slotProps={{
                input: {
                  min,
                  max,
                  step,
                },
              }}
              sx={{ width: 100 }}
              error={!!validationErrors[index]}
            />
          </Stack>
          {validationErrors[index] && (
            <FormHelperText sx={{ color: 'danger.400' }}>
              {validationErrors[index]}
            </FormHelperText>
          )}
        </Stack>
      );
    }

    // Boolean with switch
    if (
      (type === 'bool' || type === 'boolean') &&
      (uiWidget === 'switch' || !uiWidget)
    ) {
      return (
        <Switch
          checked={Boolean(param.value)}
          onChange={(e) => {
            const newParams = [...parameters];
            newParams[index].value = e.target.checked;
            setParameters(newParams);
          }}
        />
      );
    }

    // Enum with radio or select
    if (type === 'enum' || schema?.options || schema?.enum) {
      const options = schema?.options || schema?.enum || [];

      if (uiWidget === 'radio') {
        return (
          <RadioGroup
            value={String(param.value)}
            onChange={(e) => {
              const newParams = [...parameters];
              newParams[index].value = e.target.value;
              setParameters(newParams);
            }}
          >
            <Stack direction="row" spacing={2}>
              {options.map((option) => (
                <Radio key={option} value={option} label={option} />
              ))}
            </Stack>
          </RadioGroup>
        );
      } else {
        // Default to select dropdown
        return (
          <Select
            value={String(param.value)}
            onChange={(_, value) => {
              const newParams = [...parameters];
              newParams[index].value = value;
              setParameters(newParams);
            }}
            sx={{ flex: 1 }}
          >
            {options.map((option) => (
              <Option key={option} value={option}>
                {option}
              </Option>
            ))}
          </Select>
        );
      }
    }

    // Integer or Float without slider
    if (
      type === 'int' ||
      type === 'integer' ||
      type === 'float' ||
      type === 'number'
    ) {
      const min = schema?.min;
      const max = schema?.max;
      const step =
        schema?.step ?? (type === 'int' || type === 'integer' ? 1 : 0.00001);

      return (
        <Stack direction="column" spacing={1} sx={{ flex: 1 }}>
          <Input
            type="number"
            value={param.value}
            onChange={(e) => {
              const newParams = [...parameters];
              const val = e.target.value;
              newParams[index].value = val === '' ? '' : Number(val);
              updateParameterAndValidate(newParams, index);
            }}
            slotProps={{
              input: {
                min,
                max,
                step,
              },
            }}
            sx={{ flex: 1 }}
            error={!!validationErrors[index]}
          />
          {validationErrors[index] && (
            <FormHelperText sx={{ color: 'danger.400' }}>
              {validationErrors[index]}
            </FormHelperText>
          )}
        </Stack>
      );
    }

    // String with password widget
    if (type === 'string' && uiWidget === 'password') {
      return (
        <Input
          type="password"
          value={String(param.value)}
          onChange={(e) => {
            const newParams = [...parameters];
            newParams[index].value = e.target.value;
            setParameters(newParams);
          }}
          sx={{ flex: 1 }}
        />
      );
    }

    // Complex objects/arrays - render as JSON editor
    if (
      !param.isShorthand &&
      (Array.isArray(param.value) ||
        (typeof param.value === 'object' && param.value !== null))
    ) {
      return (
        <Editor
          height="120px"
          defaultLanguage="json"
          value={JSON.stringify(param.value, null, 2)}
          onChange={(value) => {
            const newParams = [...parameters];
            try {
              newParams[index].value = value ? JSON.parse(value) : null;
            } catch (e) {
              // Keep the string value if parsing fails
            }
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
      );
    }

    // Default: regular string input
    return (
      <Input
        placeholder="Value (e.g., 0.001, true, false, or any string)"
        value={String(param.value)}
        onChange={(e) => {
          const newParams = [...parameters];
          newParams[index].value = e.target.value;
          setParameters(newParams);
        }}
        sx={{ flex: 1 }}
      />
    );
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
          <Stack spacing={3}>
            {/* Run Settings Section */}
            <Stack spacing={2}>
              <Typography level="title-sm">Run Settings</Typography>
              <FormControl required>
                <FormLabel>Provider</FormLabel>
                <Select
                  placeholder={
                    providers.length
                      ? 'Select a compute provider'
                      : 'No compute providers configured'
                  }
                  value={selectedProviderId || null}
                  onChange={(_, value) => setSelectedProviderId(value || '')}
                  disabled={
                    isSubmitting || providersIsLoading || providers.length === 0
                  }
                  slotProps={{
                    listbox: { sx: { maxHeight: 240 } },
                  }}
                >
                  {providers.map((provider: any) => (
                    <Option key={provider.id} value={provider.id}>
                      {provider.name}
                    </Option>
                  ))}
                </Select>
                <FormHelperText>
                  Choose which compute provider should run this task.
                </FormHelperText>
              </FormControl>
            </Stack>

            <Divider />

            {/* Task Parameters Section */}
            <Stack spacing={2}>
              <Typography level="title-sm">Task Parameters</Typography>
              {parameters.length === 0 ||
              (parameters.length === 1 &&
                !parameters[0].key &&
                !parameters[0].value) ? (
                <Typography level="body-sm" color="neutral">
                  This task has no parameters defined. Click Submit to queue
                  with default configuration.
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {parameters.map((param, index) => {
                    const schema = param.schema;
                    const label = schema?.title || param.key;

                    return (
                      <FormControl
                        key={param.key || index}
                        sx={{ width: '100%' }}
                      >
                        <Stack
                          direction="row"
                          spacing={2}
                          alignItems="center"
                          sx={{ width: '100%' }}
                        >
                          <FormLabel
                            sx={{ alignSelf: 'center', minWidth: 160 }}
                          >
                            {label}:
                          </FormLabel>
                          {renderParameterInput(param, index)}
                        </Stack>
                      </FormControl>
                    );
                  })}
                </Stack>
              )}
              <Typography level="body-sm" color="neutral">
                Parameters can be accessed in your task script using{' '}
                <code>lab.get_config()</code>
              </Typography>
            </Stack>
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
            disabled={!selectedProviderId}
          >
            Submit
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
