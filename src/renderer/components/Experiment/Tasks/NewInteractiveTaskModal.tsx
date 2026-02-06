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
  ModalClose,
  ModalDialog,
  Stack,
  FormHelperText,
  Typography,
  Select,
  Option,
  Alert,
  Card,
  CardContent,
  Grid,
  Skeleton,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemContent,
  Chip,
} from '@mui/joy';
import { ArrowLeftIcon, ArrowRightIcon, Trash2Icon, PlayIcon, LibraryIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

type ProviderOption = {
  id: string;
  name: string;
};

type ConfigField = {
  field_name: string;
  env_var: string;
  field_type: 'str' | 'integer';
  required?: boolean;
  placeholder?: string;
  help_text?: string;
  password?: boolean;
};

type InteractiveTemplate = {
  id: string;
  interactive_type: string;
  name: string;
  description: string;
  env_parameters?: ConfigField[];
  icon?: string;
};

type ImportedTask = {
  id: string;
  name: string;
  config: string | object;
  interactive_type?: string;
};

type NewInteractiveTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    data: {
      title: string;
      cpus?: string;
      memory?: string;
      accelerators?: string;
      interactive_type: 'vscode' | 'jupyter' | 'vllm' | 'ssh' | 'ollama';
      provider_id?: string;
      env_parameters?: Record<string, string>;
    },
    shouldLaunch?: boolean,
  ) => void;
  isSubmitting?: boolean;
  providers: ProviderOption[];
  isProvidersLoading?: boolean;
  importedTasks: ImportedTask[];
  onDeleteTask: (taskId: string) => void;
  onQueueTask: (task: ImportedTask) => void;
  onRefreshTasks: () => void;
};

export default function NewInteractiveTaskModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  providers,
  isProvidersLoading = false,
  importedTasks = [],
  onDeleteTask,
  onQueueTask,
  onRefreshTasks,
}: NewInteractiveTaskModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const navigate = useNavigate();
  const [step, setStep] = React.useState<'gallery' | 'config'>('gallery');
  const [selectedTemplate, setSelectedTemplate] =
    React.useState<InteractiveTemplate | null>(null);
  const [title, setTitle] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [selectedProviderId, setSelectedProviderId] = React.useState('');
  const [configFieldValues, setConfigFieldValues] = React.useState<
    Record<string, string>
  >({});

  // Fetch interactive gallery
  const { data: galleryData, isLoading: galleryIsLoading } = useSWR(
    experimentInfo?.id && open
      ? chatAPI.Endpoints.Task.InteractiveGallery(experimentInfo.id)
      : null,
    fetcher,
  );

  const gallery = React.useMemo(() => {
    if (galleryData?.status === 'success' && Array.isArray(galleryData.data)) {
      return galleryData.data as InteractiveTemplate[];
    }
    return [];
  }, [galleryData]);

  React.useEffect(() => {
    if (!open) {
      setStep('gallery');
      setSelectedTemplate(null);
      setTitle('');
      setCpus('');
      setMemory('');
      setAccelerators('');
      setConfigFieldValues({});
      setSelectedProviderId(providers[0]?.id || '');
    } else if (open && providers.length && !selectedProviderId) {
      setSelectedProviderId(providers[0].id);
    }
  }, [open, providers, selectedProviderId]);

  React.useEffect(() => {
    if (!providers.length) {
      setSelectedProviderId('');
      return;
    }
    if (!selectedProviderId) {
      setSelectedProviderId(providers[0].id);
      return;
    }
    if (!providers.find((p) => p.id === selectedProviderId)) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  const handleTemplateSelect = (template: InteractiveTemplate) => {
    setSelectedTemplate(template);
    setStep('config');
    // Initialize config field values
    const initialValues: Record<string, string> = {};
    template.env_parameters?.forEach((field) => {
      if (field.field_type === 'integer' && field.env_var === 'TP_SIZE') {
        initialValues[field.env_var] = '1';
      }
    });
    setConfigFieldValues(initialValues);
  };

  const handleBack = () => {
    setStep('gallery');
    setSelectedTemplate(null);
    setConfigFieldValues({});
  };

  const handleConfigFieldChange = (envVar: string, value: string) => {
    setConfigFieldValues((prev) => ({
      ...prev,
      [envVar]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent, shouldLaunch: boolean = false) => {
    e.preventDefault();
    if (!title.trim()) {
      return;
    }

    if (!selectedProviderId) {
      return;
    }

    if (!selectedTemplate) {
      return;
    }

    // Validate required config fields
    const requiredFields =
      selectedTemplate.env_parameters?.filter((f) => f.required) || [];
    for (const field of requiredFields) {
      if (!configFieldValues[field.env_var]?.trim()) {
        return;
      }
    }

    onSubmit(
      {
        title: title.trim(),
        cpus: cpus || undefined,
        memory: memory || undefined,
        accelerators: accelerators || undefined,
        interactive_type: selectedTemplate.interactive_type as
          | 'vscode'
          | 'jupyter'
          | 'vllm'
          | 'ssh'
          | 'ollama',
        provider_id: selectedProviderId,
        env_parameters: configFieldValues,
      },
      shouldLaunch,
    );
  };

  const canSubmit = React.useMemo(() => {
    if (!title.trim() || !selectedProviderId || !selectedTemplate) {
      return false;
    }

    const requiredFields =
      selectedTemplate.env_parameters?.filter((f) => f.required) || [];
    for (const field of requiredFields) {
      if (!configFieldValues[field.env_var]?.trim()) {
        return false;
      }
    }

    return true;
  }, [title, selectedProviderId, selectedTemplate, configFieldValues]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxHeight: '80vh',
          width: step === 'gallery' ? '70vw' : '60vw',
          overflow: 'hidden',
        }}
      >
        <ModalClose />
        <DialogTitle>
          {step === 'gallery' ? 'New Interactive Task' : 'Configure Task'}
        </DialogTitle>
        <form onSubmit={(e) => handleSubmit(e, false)}>
          <DialogContent
            sx={{ maxHeight: '60vh', overflow: 'auto', padding: 1 }}
          >
            {step === 'gallery' ? (
              <Stack spacing={3}>
                {/* Imported Tasks Section */}
                {importedTasks.length > 0 && (
                  <>
                    <Stack spacing={1}>
                      <Typography level="title-md">
                        Your Templates
                      </Typography>
                    </Stack>
                    <List
                      sx={{
                        '--ListItem-paddingY': '12px',
                        '--ListItem-paddingX': '16px',
                      }}
                    >
                      {importedTasks.map((task) => {
                        const cfg =
                          typeof task.config === 'string'
                            ? JSON.parse(task.config)
                            : task.config;
                        const interactiveType =
                          cfg?.interactive_type || task.interactive_type || 'vscode';

                        const getInteractiveTypeLabel = (type: string) => {
                          switch (type) {
                            case 'jupyter': return 'Jupyter';
                            case 'vllm': return 'vLLM';
                            case 'ollama': return 'Ollama';
                            case 'ssh': return 'SSH';
                            default: return 'VS Code';
                          }
                        };

                        return (
                          <ListItem
                            key={task.id}
                            endAction={
                              <Stack direction="row" spacing={1}>
                                <IconButton
                                  size="sm"
                                  variant="soft"
                                  color="primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onQueueTask(task);
                                    onClose();
                                  }}
                                  title="Launch this template"
                                >
                                  <PlayIcon size={16} />
                                </IconButton>
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteTask(task.id);
                                  }}
                                >
                                  <Trash2Icon size={16} />
                                </IconButton>
                              </Stack>
                            }
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 'sm',
                              mb: 1,
                            }}
                          >
                            <ListItemContent>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography level="title-sm">{task.name}</Typography>
                                <Chip
                                  size="sm"
                                  variant="soft"
                                  color="primary"
                                >
                                  {getInteractiveTypeLabel(interactiveType)}
                                </Chip>
                              </Stack>
                            </ListItemContent>
                          </ListItem>
                        );
                      })}
                    </List>
                    <Divider />
                  </>
                )}

                {/* Import More Section */}
                <Stack spacing={1}>
                  {importedTasks.length === 0 ? (
                    <>
                      <Typography level="title-md">
                        Get Started with Interactive Tasks
                      </Typography>
                      <Typography level="body-sm" color="neutral">
                        Select an interactive task type to import. Start with VS Code, Jupyter, or vLLM.
                      </Typography>
                    </>
                  ) : (
                    <Divider />
                  )}
                </Stack>

                {importedTasks.length > 0 && (
                  <Button
                    variant="soft"
                    color="primary"
                    startDecorator={<LibraryIcon size={18} />}
                    onClick={() => {
                      onClose();
                      navigate('/tasks-gallery', { state: { tab: 'interactive' } });
                    }}
                    sx={{ alignSelf: 'flex-start', mt: 1 }}
                  >
                    Import More Interactive Tasks
                  </Button>
                )}

                {importedTasks.length === 0 ? (
                  // Show first 3 gallery items for new users
                  <>
                    {(galleryIsLoading || !galleryData) && (
                      <Grid container spacing={2}>
                        {[1, 2, 3].map((i) => (
                          <Grid xs={12} sm={6} md={4} key={i}>
                            <Card variant="outlined">
                              <CardContent>
                                <Skeleton
                                  variant="rectangular"
                                  width={32}
                                  height={28}
                                />
                                <Skeleton
                                  variant="text"
                                  level="title-md"
                                  sx={{ mt: 1 }}
                                />
                                <Skeleton
                                  variant="text"
                                  level="body-sm"
                                  sx={{ mt: 1 }}
                                />
                                <Skeleton
                                  variant="text"
                                  level="body-sm"
                                  width="60%"
                                />
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    )}
                    {!galleryIsLoading && galleryData && gallery.length === 0 && (
                      <Typography level="body-sm" color="danger">
                        No interactive task templates available.
                      </Typography>
                    )}
                    {!galleryIsLoading && galleryData && gallery.length > 0 && (
                      <Grid container spacing={2}>
                        {gallery.slice(0, 3).map((template) => (
                          <Grid xs={12} sm={6} md={4} key={template.id}>
                            <Card
                              variant="outlined"
                              sx={{
                                cursor: 'pointer',
                                '&:hover': {
                                  boxShadow: 'md',
                                  borderColor: 'primary.500',
                                },
                              }}
                              onClick={() => handleTemplateSelect(template)}
                            >
                              <CardContent>
                                {template.icon && (
                                  <img
                                    src={template.icon}
                                    alt={`${template.name} icon`}
                                    width={32}
                                    height={32}
                                  />
                                )}
                                <Typography level="title-md">
                                  {template.name}
                                </Typography>
                                <Typography level="body-sm" sx={{ mt: 1 }}>
                                  {template.description}
                                </Typography>
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    )}
                  </>
                ) : null}
              </Stack>
            ) : (
              <Stack spacing={3}>
                <FormControl required>
                  <FormLabel>Title</FormLabel>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Interactive session name"
                    autoFocus
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Provider</FormLabel>
                  <Select
                    placeholder={
                      providers.length
                        ? 'Select a provider'
                        : 'No providers configured'
                    }
                    value={selectedProviderId || null}
                    onChange={(_, value) => setSelectedProviderId(value || '')}
                    disabled={
                      isSubmitting ||
                      isProvidersLoading ||
                      providers.length === 0
                    }
                    slotProps={{
                      listbox: { sx: { maxHeight: 240 } },
                    }}
                  >
                    {providers.map((provider) => (
                      <Option key={provider.id} value={provider.id}>
                        {provider.name}
                      </Option>
                    ))}
                  </Select>
                  <FormHelperText>
                    Choose which provider should run this interactive session.
                  </FormHelperText>
                </FormControl>

                {selectedTemplate?.interactive_type === 'ssh' && (
                  <Alert color="warning" variant="soft">
                    <Typography
                      level="body-sm"
                      fontWeight="bold"
                      sx={{ mb: 0.5 }}
                    >
                      Security Warning
                    </Typography>
                    <Typography level="body-xs">
                      This will create a public TCP tunnel. Be careful when
                      sharing the SSH command with anyone, as it provides direct
                      access to your remote machine.
                    </Typography>
                  </Alert>
                )}

                {selectedTemplate?.env_parameters &&
                  selectedTemplate.env_parameters.length > 0 && (
                    <>
                      {selectedTemplate.env_parameters.map((field) => (
                        <FormControl
                          key={field.env_var}
                          required={field.required}
                        >
                          <FormLabel>{field.field_name}</FormLabel>
                          <Input
                            type={
                              field.password
                                ? 'password'
                                : field.field_type === 'integer'
                                  ? 'number'
                                  : 'text'
                            }
                            value={configFieldValues[field.env_var] || ''}
                            onChange={(e) =>
                              handleConfigFieldChange(
                                field.env_var,
                                e.target.value,
                              )
                            }
                            placeholder={field.placeholder}
                          />
                          {field.help_text && (
                            <FormHelperText>{field.help_text}</FormHelperText>
                          )}
                        </FormControl>
                      ))}
                    </>
                  )}

                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ flexWrap: 'wrap', rowGap: 2 }}
                >
                  <FormControl sx={{ minWidth: '160px', flex: 1 }}>
                    <FormLabel>CPUs</FormLabel>
                    <Input
                      value={cpus}
                      onChange={(e) => setCpus(e.target.value)}
                      placeholder="e.g. 4"
                    />
                  </FormControl>

                  <FormControl sx={{ minWidth: '160px', flex: 1 }}>
                    <FormLabel>Memory (GB)</FormLabel>
                    <Input
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                      placeholder="e.g. 16"
                    />
                  </FormControl>

                  <FormControl sx={{ minWidth: '200px', flex: 2 }}>
                    <FormLabel>Accelerators</FormLabel>
                    <Input
                      value={accelerators}
                      onChange={(e) => setAccelerators(e.target.value)}
                      placeholder="e.g. RTX3090:1 or H100:8"
                    />
                  </FormControl>
                </Stack>

                <FormHelperText>
                  Setup and command are pre-populated based on the selected
                  interactive type.
                </FormHelperText>
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Stack
              direction="row"
              spacing={2}
              sx={{ width: '100%', justifyContent: 'space-between' }}
            >
              <Button
                variant="plain"
                color="neutral"
                onClick={step === 'gallery' ? onClose : handleBack}
                disabled={isSubmitting}
                startDecorator={<ArrowLeftIcon size={16} />}
              >
                {step === 'gallery' ? 'Cancel' : 'Back'}
              </Button>
              {step === 'config' && (
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    loading={isSubmitting}
                    disabled={isSubmitting || !canSubmit}
                    onClick={(e) => {
                      e.preventDefault();
                      handleSubmit(e, false);
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    variant="solid"
                    color="primary"
                    loading={isSubmitting}
                    disabled={isSubmitting || !canSubmit}
                    onClick={(e) => {
                      e.preventDefault();
                      handleSubmit(e, true);
                    }}
                    endDecorator={<ArrowRightIcon size={16} />}
                  >
                    Launch
                  </Button>
                </Stack>
              )}
            </Stack>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
