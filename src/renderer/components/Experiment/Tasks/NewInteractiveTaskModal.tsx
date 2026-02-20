import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Checkbox from '@mui/joy/Checkbox';
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
  Tabs,
  TabList,
  Tab,
  Box,
  Chip,
} from '@mui/joy';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';

type ProviderOption = {
  id: string;
  name: string;
  type?: string;
  config?: any;
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
  supported_accelerators?: string;
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
      local?: boolean;
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
  const [step, setStep] = React.useState<'provider' | 'gallery' | 'config'>(
    'provider',
  );
  const [selectedTemplate, setSelectedTemplate] =
    React.useState<InteractiveTemplate | null>(null);
  const [title, setTitle] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [isLocal, setIsLocal] = React.useState(false);
  const [selectedProviderId, setSelectedProviderId] = React.useState('');
  const [configFieldValues, setConfigFieldValues] = React.useState<
    Record<string, string>
  >({});
  const [activeGalleryTab, setActiveGalleryTab] = React.useState<
    'interactive' | 'team-interactive'
  >('interactive');
  const [importingTeamTaskId, setImportingTeamTaskId] = React.useState<
    string | number | null
  >(null);
  const { addNotification } = useNotification();

  // Helper to check if a provider supports requested accelerators
  const isProviderCompatible = React.useCallback(
    (provider: any, taskSupportedAccelerators: string | undefined) => {
      if (!taskSupportedAccelerators) return true;

      const supported = provider.config?.supported_accelerators || [];
      if (supported.length === 0) return true; // Default to compatible if not specified

      const reqAcc = String(taskSupportedAccelerators).toLowerCase();

      // Check for Apple Silicon
      if (
        (reqAcc.includes('apple') || reqAcc.includes('mps')) &&
        supported.includes('AppleSilicon')
      ) {
        return true;
      }

      // Check for NVIDIA
      if (
        (reqAcc.includes('nvidia') ||
          reqAcc.includes('cuda') ||
          reqAcc.includes('rtx') ||
          reqAcc.includes('a100') ||
          reqAcc.includes('h100') ||
          reqAcc.includes('v100')) &&
        supported.includes('NVIDIA')
      ) {
        return true;
      }

      // Check for AMD
      if (
        (reqAcc.includes('amd') || reqAcc.includes('rocm')) &&
        supported.includes('AMD')
      ) {
        return true;
      }

      // Check for CPU
      if (reqAcc.includes('cpu') && supported.includes('cpu')) {
        return true;
      }

      // If it's just a number, we assume it's NVIDIA/CUDA
      if (/^\d+$/.test(reqAcc)) {
        return supported.includes('NVIDIA');
      }

      return false;
    },
    [],
  );

  // Fetch interactive gallery
  const { data: galleryData, isLoading: galleryIsLoading } = useSWR(
    experimentInfo?.id && open
      ? chatAPI.Endpoints.Task.InteractiveGallery(experimentInfo.id)
      : null,
    fetcher,
  );

  // Fetch team gallery
  const { data: teamGalleryData, isLoading: teamGalleryIsLoading } = useSWR(
    experimentInfo?.id && open
      ? chatAPI.Endpoints.Task.TeamGallery(experimentInfo.id)
      : null,
    fetcher,
  );

  const gallery = React.useMemo(() => {
    if (galleryData?.status === 'success' && Array.isArray(galleryData.data)) {
      return galleryData.data as InteractiveTemplate[];
    }
    return [];
  }, [galleryData]);

  const teamGallery = React.useMemo(() => {
    if (
      teamGalleryData?.status === 'success' &&
      Array.isArray(teamGalleryData.data)
    ) {
      return teamGalleryData.data as any[];
    }
    return [];
  }, [teamGalleryData]);

  React.useEffect(() => {
    if (!open) {
      setStep('provider');
      setSelectedTemplate(null);
      setTitle('');
      setCpus('');
      setMemory('');
      setAccelerators('');
      setIsLocal(false);
      setConfigFieldValues({});
      setSelectedProviderId('');
      setActiveGalleryTab('interactive');
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (!providers.length) {
      setSelectedProviderId('');
      return;
    }
    if (!selectedProviderId) {
      // Don't auto-select first one, let user pick in the first step
      return;
    }
    if (!providers.find((p) => p.id === selectedProviderId)) {
      setSelectedProviderId('');
    }
  }, [open, providers, selectedProviderId]);

  const selectedProvider = React.useMemo(
    () => providers.find((p) => p.id === selectedProviderId),
    [providers, selectedProviderId],
  );

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
    // Initialize accelerators from template if available
    if (template.supported_accelerators) {
      setAccelerators(template.supported_accelerators);
    }
  };

  const handleBack = () => {
    if (step === 'config') {
      setStep('gallery');
      setSelectedTemplate(null);
      setConfigFieldValues({});
    } else if (step === 'gallery') {
      setStep('provider');
    }
  };

  const handleConfigFieldChange = (envVar: string, value: string) => {
    setConfigFieldValues((prev) => ({
      ...prev,
      [envVar]: value,
    }));
  };

  const handleImportTeamTask = async (galleryIdentifier: string | number) => {
    if (!experimentInfo?.id) {
      addNotification({
        type: 'warning',
        message: 'Please select an experiment first.',
      });
      return;
    }

    setImportingTeamTaskId(galleryIdentifier);
    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Task.ImportFromTeamGallery(experimentInfo.id),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            gallery_id: galleryIdentifier.toString(),
            experiment_id: experimentInfo.id,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to import task: ${errorText}`,
        });
        return;
      }

      const result = await response.json();
      addNotification({
        type: 'success',
        message: result.message || 'Task imported successfully!',
      });

      // Refresh the imported tasks list
      onRefreshTasks();
    } catch (err: any) {
      console.error('Error importing team task:', err);
      addNotification({
        type: 'danger',
        message: `Failed to import task: ${err?.message || String(err)}`,
      });
    } finally {
      setImportingTeamTaskId(null);
    }
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
    const requiredFields = (
      selectedTemplate.env_parameters?.filter((f) => f.required) || []
    ).filter((f) => !(isLocal && f.env_var === 'NGROK_AUTH_TOKEN'));
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
        template_id: selectedTemplate.id,
        provider_id: selectedProviderId,
        env_parameters: configFieldValues,
        local: isLocal,
      },
      shouldLaunch,
    );
  };

  const canSubmit = React.useMemo(() => {
    if (!title.trim() || !selectedProviderId || !selectedTemplate) {
      return false;
    }

    const requiredFields = (
      selectedTemplate.env_parameters?.filter((f) => f.required) || []
    ).filter((f) => !(isLocal && f.env_var === 'NGROK_AUTH_TOKEN'));
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
          width:
            step === 'provider' ? '40vw' : step === 'gallery' ? '70vw' : '60vw',
          overflow: 'hidden',
        }}
      >
        <ModalClose />
        <DialogTitle>
          {step === 'provider'
            ? 'Select Provider'
            : step === 'gallery'
              ? 'New Interactive Task'
              : 'Configure Task'}
        </DialogTitle>
        <form onSubmit={(e) => handleSubmit(e, false)}>
          <DialogContent
            sx={{ maxHeight: '60vh', overflow: 'auto', padding: 1 }}
          >
            {step === 'provider' && (
              <Stack spacing={3} sx={{ py: 2 }}>
                <Typography level="body-md">
                  First, select the compute provider you want to use for this
                  interactive session. We'll show you compatible tasks in the
                  next step.
                </Typography>
                <FormControl required>
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
                </FormControl>

                {selectedProvider &&
                  selectedProvider.config?.supported_accelerators &&
                  selectedProvider.config.supported_accelerators.length > 0 && (
                    <Box>
                      <Typography level="body-xs" sx={{ mb: 1 }}>
                        Supported Accelerators:
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        {selectedProvider.config.supported_accelerators.map(
                          (acc: string) => (
                            <Chip
                              key={acc}
                              size="sm"
                              variant="soft"
                              color="primary"
                            >
                              {acc}
                            </Chip>
                          ),
                        )}
                      </Stack>
                    </Box>
                  )}

                <Box
                  sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}
                >
                  <Button
                    disabled={!selectedProviderId}
                    onClick={() => setStep('gallery')}
                    endDecorator={<ArrowRightIcon size={16} />}
                  >
                    Next: Choose Task
                  </Button>
                </Box>
              </Stack>
            )}
            {step === 'config' && (
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

                <Checkbox
                  label="Enable direct web access (no tunnel)"
                  checked={isLocal}
                  onChange={(e) => setIsLocal(e.target.checked)}
                />
                <FormHelperText sx={{ mt: -2 }}>
                  When enabled, the session will be accessible directly via a
                  local address (e.g. http://localhost:8888). Recommended for
                  local providers only.
                </FormHelperText>

                {selectedTemplate?.env_parameters &&
                  selectedTemplate.env_parameters.length > 0 && (
                    <>
                      {selectedTemplate.env_parameters.map((field) => (
                        <FormControl
                          key={field.env_var}
                          required={
                            field.required &&
                            !(isLocal && field.env_var === 'NGROK_AUTH_TOKEN')
                          }
                          disabled={
                            isLocal && field.env_var === 'NGROK_AUTH_TOKEN'
                          }
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
            {step === 'gallery' && (
              <Stack spacing={3}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography level="title-md">
                    Choose an interactive source
                  </Typography>
                </Box>
                <Tabs
                  size="sm"
                  value={activeGalleryTab}
                  onChange={(_e, val) => {
                    if (val) {
                      setActiveGalleryTab(
                        val as 'interactive' | 'team-interactive',
                      );
                    }
                  }}
                >
                  <TabList>
                    <Tab value="interactive">Interactive Gallery</Tab>
                    <Tab value="team-interactive">Team Interactive Gallery</Tab>
                  </TabList>
                </Tabs>

                {activeGalleryTab === 'interactive' && (
                  <>
                    <Stack spacing={1}>
                      {importedTasks.length === 0 ? (
                        <>
                          <Typography level="title-md">
                            Get Started with Interactive Tasks
                          </Typography>
                          <Typography level="body-sm" color="neutral">
                            Select an interactive task type to configure. Start
                            with VS Code, Jupyter, or vLLM.
                          </Typography>
                        </>
                      ) : (
                        <Typography level="body-sm" color="neutral">
                          Pick an interactive template from the gallery to
                          configure a new task.
                        </Typography>
                      )}
                    </Stack>

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
                    {!galleryIsLoading &&
                      galleryData &&
                      gallery.length === 0 && (
                        <Typography level="body-sm" color="danger">
                          No interactive task templates available.
                        </Typography>
                      )}
                    {!galleryIsLoading && galleryData && gallery.length > 0 && (
                      <Grid container spacing={2}>
                        {gallery
                          .filter((template) =>
                            isProviderCompatible(
                              selectedProvider,
                              template.supported_accelerators,
                            ),
                          )
                          .map((template) => (
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
                                  {template.supported_accelerators && (
                                    <Box sx={{ mt: 1.5 }}>
                                      <Stack
                                        direction="row"
                                        spacing={0.5}
                                        flexWrap="wrap"
                                      >
                                        <Chip
                                          size="sm"
                                          variant="soft"
                                          color="primary"
                                        >
                                          {template.supported_accelerators}
                                        </Chip>
                                      </Stack>
                                    </Box>
                                  )}
                                </CardContent>
                              </Card>
                            </Grid>
                          ))}
                      </Grid>
                    )}
                  </>
                )}

                {activeGalleryTab === 'team-interactive' && (
                  <>
                    <Stack spacing={1}>
                      <Typography level="title-md">
                        Team Interactive Gallery
                      </Typography>
                      <Typography level="body-sm" color="neutral">
                        Import interactive task templates shared by your team.
                      </Typography>
                    </Stack>

                    {teamGalleryIsLoading && (
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

                    {!teamGalleryIsLoading &&
                      teamGalleryData &&
                      teamGallery.length === 0 && (
                        <Typography level="body-sm" color="neutral">
                          No team interactive tasks available.
                        </Typography>
                      )}

                    {!teamGalleryIsLoading &&
                      teamGalleryData &&
                      teamGallery.length > 0 && (
                        <Grid container spacing={2}>
                          {teamGallery
                            .filter((task: any) =>
                              isProviderCompatible(
                                selectedProvider,
                                task.supported_accelerators ||
                                  task.config?.supported_accelerators,
                              ),
                            )
                            .map((task: any, index: number) => {
                              const taskTitle =
                                task.title || task.name || 'Untitled Task';
                              const taskId =
                                task?.id ||
                                task?.name ||
                                task?.title ||
                                index.toString();
                              let galleryIdentifier: string | number;
                              if (task?.id) {
                                galleryIdentifier = task.id;
                              } else if (task?.name) {
                                galleryIdentifier = task.name;
                              } else if (task?.title) {
                                galleryIdentifier = task.title;
                              } else {
                                galleryIdentifier = index;
                              }

                              const taskSupportedAccelerators =
                                task.supported_accelerators ||
                                task.config?.supported_accelerators;

                              return (
                                <Grid xs={12} sm={6} md={4} key={taskId}>
                                  <Card
                                    variant="outlined"
                                    sx={{
                                      cursor: 'pointer',
                                      '&:hover': {
                                        boxShadow: 'md',
                                        borderColor: 'primary.500',
                                      },
                                    }}
                                    onClick={() =>
                                      handleImportTeamTask(galleryIdentifier)
                                    }
                                  >
                                    <CardContent>
                                      {task.icon && (
                                        <img
                                          src={task.icon}
                                          alt={`${taskTitle} icon`}
                                          width={32}
                                          height={32}
                                        />
                                      )}
                                      <Typography level="title-md">
                                        {taskTitle}
                                      </Typography>
                                      <Typography
                                        level="body-sm"
                                        sx={{ mt: 1 }}
                                      >
                                        {task.description || 'No description'}
                                      </Typography>
                                      {taskSupportedAccelerators && (
                                        <Box sx={{ mt: 1.5 }}>
                                          <Stack
                                            direction="row"
                                            spacing={0.5}
                                            flexWrap="wrap"
                                          >
                                            <Chip
                                              size="sm"
                                              variant="soft"
                                              color="primary"
                                            >
                                              {taskSupportedAccelerators}
                                            </Chip>
                                          </Stack>
                                        </Box>
                                      )}
                                      {importingTeamTaskId ===
                                        galleryIdentifier && (
                                        <Typography
                                          level="body-xs"
                                          color="primary"
                                          sx={{ mt: 1 }}
                                        >
                                          Importing...
                                        </Typography>
                                      )}
                                    </CardContent>
                                  </Card>
                                </Grid>
                              );
                            })}
                        </Grid>
                      )}
                  </>
                )}
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
