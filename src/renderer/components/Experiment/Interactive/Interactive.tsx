import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';
import {
  Button,
  LinearProgress,
  Stack,
  Typography,
  Card,
  CardContent,
  Chip,
  Box,
  IconButton,
} from '@mui/joy';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PlusIcon, TerminalIcon, PlayIcon, Trash2Icon } from 'lucide-react';
import { useSWRWithAuth as useSWR, useAPI } from 'renderer/lib/authContext';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import TaskTemplateList from '../Tasks/TaskTemplateList';
import NewInteractiveTaskModal from '../Tasks/NewInteractiveTaskModal';
import InteractiveVSCodeModal from '../Tasks/InteractiveVSCodeModal';
import InteractiveJupyterModal from '../Tasks/InteractiveJupyterModal';
import InteractiveVllmModal from '../Tasks/InteractiveVllmModal';
import InteractiveSshModal from '../Tasks/InteractiveSshModal';
import InteractiveOllamaModal from '../Tasks/InteractiveOllamaModal';
import EditInteractiveTaskModal from '../Tasks/EditInteractiveTaskModal';
import ViewOutputModalStreaming from '../Tasks/ViewOutputModalStreaming';
import JobProgress from '../Tasks/JobProgress';
import { jobChipColor } from 'renderer/lib/utils';

const duration = require('dayjs/plugin/duration');

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function Interactive() {
  const [interactiveModalOpen, setInteractiveModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [taskBeingEdited, setTaskBeingEdited] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewOutputFromJob, setViewOutputFromJob] = useState(-1);
  const [interactiveJobForModal, setInteractiveJobForModal] = useState(-1);
  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();
  const { fetchWithAuth, team } = useAuth();

  // Trigger to force re-render when localStorage changes
  const [pendingIdsTrigger, setPendingIdsTrigger] = useState(0);

  const {
    data: providerListData,
    error: providerListError,
    isLoading: providersIsLoading,
  } = useAPI('compute_provider', ['list'], { teamId: team?.id ?? null });

  const providers = useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  useEffect(() => {
    if (providerListError) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch providers', providerListError);
    }
  }, [providerListError]);

  // Pending job IDs persisted per experiment
  const pendingJobsStorageKey = useMemo(
    () =>
      experimentInfo?.id
        ? `pendingJobIds:${String(experimentInfo.id)}`
        : 'pendingJobIds:unknown',
    [experimentInfo?.id],
  );

  const getPendingJobIds = useCallback((): string[] => {
    try {
      const raw = window.localStorage.getItem(pendingJobsStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const result = Array.isArray(parsed) ? parsed : [];
      return result;
    } catch {
      return [];
    }
  }, [pendingJobsStorageKey]);

  const setPendingJobIds = useCallback(
    (ids: string[]) => {
      try {
        window.localStorage.setItem(pendingJobsStorageKey, JSON.stringify(ids));
        setPendingIdsTrigger((prev) => prev + 1);
      } catch {
        // ignore storage failures
      }
    },
    [pendingJobsStorageKey],
  );

  // Listen for localStorage changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === pendingJobsStorageKey) {
        setPendingIdsTrigger((prev) => prev + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pendingJobsStorageKey]);

  // Fetch REMOTE jobs with interactive subtype
  const {
    data: jobsRemote,
    isError: jobsIsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.ListWithFilters(
          experimentInfo.id,
          'REMOTE',
          '',
          'interactive',
        )
      : null,
    fetcher,
    {
      refreshInterval: 3000,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshWhenHidden: true,
      refreshWhenOffline: false,
    },
  );

  const jobs = useMemo(() => {
    return Array.isArray(jobsRemote) ? jobsRemote : [];
  }, [jobsRemote]);

  // Fetch templates with interactive subtype
  const {
    data: allTemplates,
    isError: templatesIsError,
    isLoading: templatesIsLoading,
    mutate: templatesMutate,
  } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Task.ListBySubtypeInExperiment(
          experimentInfo.id,
          'interactive',
          'REMOTE',
        )
      : null,
    fetcher,
  );

  const tasks =
    (Array.isArray(allTemplates)
      ? allTemplates
      : allTemplates?.data || []
    )?.filter((template: any) => {
      return template.experiment_id === experimentInfo?.id;
    }) || [];

  // Remove pending placeholders that are now present in jobs
  useEffect(() => {
    if (!jobs || !Array.isArray(jobs)) return;
    const pending = getPendingJobIds();
    if (pending.length === 0) return;
    const existingIds = new Set((jobs as any[]).map((j: any) => String(j.id)));
    const stillPending = pending.filter((id) => !existingIds.has(String(id)));
    if (stillPending.length !== pending.length) {
      setPendingJobIds(stillPending);
    }
  }, [jobs, getPendingJobIds, setPendingJobIds]);

  // Build list with placeholders for pending job IDs
  const jobsWithPlaceholders = useMemo(() => {
    const baseJobs = Array.isArray(jobs) ? jobs : [];

    // Only show INTERACTIVE status jobs (not STOPPED)
    const filteredJobs = baseJobs.filter((job: any) => {
      return job.status === 'INTERACTIVE';
    });

    const pending = getPendingJobIds();

    if (!pending.length) return filteredJobs;

    const allExistingIds = new Set(baseJobs.map((j: any) => String(j.id)));

    const placeholders = pending
      .filter((id) => !allExistingIds.has(String(id)))
      .map((id) => ({
        id: String(id),
        type: 'REMOTE',
        status: 'CREATED',
        progress: 0,
        job_data: { subtype: 'interactive' },
        placeholder: true,
      }));

    return [...placeholders, ...filteredJobs];
  }, [jobs, getPendingJobIds, pendingIdsTrigger]);

  const handleDeleteTask = async (taskId: string) => {
    if (!experimentInfo?.id) return;

    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Task.DeleteTemplate(experimentInfo?.id || '', taskId),
        {
          method: 'GET',
        },
      );

      if (response.ok) {
        addNotification({
          type: 'success',
          message: 'Template deleted successfully!',
        });
        await templatesMutate();
      } else {
        addNotification({
          type: 'danger',
          message: 'Failed to delete template. Please try again.',
        });
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to delete template. Please try again.',
      });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!experimentInfo?.id) return;

    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.Delete(experimentInfo.id, jobId),
        {
          method: 'GET',
        },
      );

      if (response.ok) {
        addNotification({
          type: 'success',
          message: 'Job deleted successfully!',
        });
        await jobsMutate();
      } else {
        addNotification({
          type: 'danger',
          message: 'Failed to delete job. Please try again.',
        });
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to delete job. Please try again.',
      });
    }
  };

  const handleSubmitInteractive = async (
    data: any,
    shouldLaunch: boolean = false,
  ) => {
    if (!experimentInfo?.id) {
      addNotification({ type: 'warning', message: 'No experiment selected' });
      return;
    }

    if (!providers.length) {
      addNotification({
        type: 'danger',
        message:
          'No providers available. Add a provider in the team settings first.',
      });
      return;
    }

    const providerMeta =
      providers.find((p) => p.id === data.provider_id) || providers[0];

    setIsSubmitting(true);
    try {
      const interactiveType = data.interactive_type || 'vscode';

      // Fetch interactive gallery to get setup and command templates
      let defaultSetup: string;
      let defaultCommand: string;

      try {
        const galleryResponse = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.InteractiveGallery(experimentInfo.id),
          {
            method: 'GET',
          },
        );

        if (galleryResponse.ok) {
          const galleryData = await galleryResponse.json();
          const template = galleryData.data?.find(
            (t: any) => t.interactive_type === interactiveType,
          );

          if (!template) {
            throw new Error(
              `Template not found for interactive type: ${interactiveType}`,
            );
          }

          defaultSetup = template.setup || '';
          defaultCommand = template.command || '';
        } else {
          throw new Error('Failed to fetch interactive gallery');
        }
      } catch (error) {
        throw error;
      }

      // Create template with flat structure
      // Use env_parameters from the gallery-defined structure
      const envVars: Record<string, string> = data.env_parameters || {};

      const templatePayload: any = {
        name: data.title,
        type: 'REMOTE',
        plugin: 'remote_orchestrator',
        experiment_id: experimentInfo.id,
        cluster_name: data.title,
        command: defaultCommand,
        cpus: data.cpus || undefined,
        memory: data.memory || undefined,
        accelerators: data.accelerators || undefined,
        setup: defaultSetup,
        subtype: 'interactive',
        interactive_type: interactiveType,
        provider_id: providerMeta.id,
        provider_name: providerMeta.name,
        env_vars: Object.keys(envVars).length > 0 ? envVars : undefined,
      };

      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Task.NewTemplate(experimentInfo?.id || ''),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(templatePayload),
        },
      );

      if (response.ok) {
        const result = await response.json();
        const taskId = result.id || result.data?.id;
        await templatesMutate();

        const interactiveTypeLabel =
          (data.interactive_type || 'vscode') === 'jupyter'
            ? 'Jupyter'
            : (data.interactive_type || 'vscode') === 'vllm'
              ? 'vLLM'
              : (data.interactive_type || 'vscode') === 'ollama'
                ? 'Ollama'
                : (data.interactive_type || 'vscode') === 'ssh'
                  ? 'SSH'
                  : 'VS Code';

        if (shouldLaunch && taskId) {
          // Construct task object from payload for launching
          const newTask = {
            id: taskId,
            ...templatePayload,
          };
          // Launch the task immediately
          await handleQueue(newTask);
          addNotification({
            type: 'success',
            message: `Interactive ${interactiveTypeLabel} session launched!`,
          });
        } else {
          addNotification({
            type: 'success',
            message: `Interactive template created. Use Queue to launch the ${interactiveTypeLabel} tunnel.`,
          });
        }

        setInteractiveModalOpen(false);
      } else {
        const txt = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to create interactive template: ${txt}`,
        });
      }
    } catch (error) {
      console.error('Error creating interactive template:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to create interactive template. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQueue = async (task: any) => {
    if (!experimentInfo?.id) return;

    const cfg =
      task.config !== undefined
        ? typeof task.config === 'string'
          ? JSON.parse(task.config)
          : task.config
        : task;

    const providerId =
      cfg.provider_id ||
      task.provider_id ||
      (providers.length ? providers[0]?.id : null);
    if (!providerId) {
      addNotification({
        type: 'danger',
        message:
          'No providers available. Add a provider in the team settings first.',
      });
      return;
    }

    const providerMeta = providers.find(
      (provider) => provider.id === providerId,
    );

    if (!providerMeta) {
      addNotification({
        type: 'danger',
        message:
          'Selected provider is unavailable. Please create or update providers in team settings.',
      });
      return;
    }

    if (!cfg.command) {
      addNotification({
        type: 'warning',
        message: 'Task is missing a command to run.',
      });
      return;
    }

    addNotification({
      type: 'success',
      message: 'Launching provider job...',
    });

    try {
      const payload = {
        experiment_id: experimentInfo.id,
        task_name: task.name,
        cluster_name: cfg.cluster_name || task.cluster_name,
        command: cfg.command || task.command,
        subtype: cfg.subtype || task.subtype,
        interactive_type: cfg.interactive_type || task.interactive_type,
        cpus: cfg.cpus || task.cpus,
        memory: cfg.memory || task.memory,
        disk_space: cfg.disk_space || task.disk_space,
        accelerators: cfg.accelerators || task.accelerators,
        num_nodes: cfg.num_nodes || task.num_nodes,
        setup: cfg.setup || task.setup,
        env_vars: cfg.env_vars || task.env_vars || {},
        parameters: cfg.parameters || task.parameters || undefined,
        file_mounts: cfg.file_mounts || task.file_mounts,
        provider_name: providerMeta.name,
        github_repo_url: cfg.github_repo_url || task.github_repo_url,
        github_directory: cfg.github_directory || task.github_directory,
        github_branch: cfg.github_branch || task.github_branch,
        run_sweeps: cfg.run_sweeps || task.run_sweeps || undefined,
        sweep_config: cfg.sweep_config || task.sweep_config || undefined,
        sweep_metric:
          cfg.sweep_metric ||
          task.sweep_metric ||
          (cfg.run_sweeps || task.run_sweeps ? 'eval/loss' : undefined),
        lower_is_better:
          cfg.lower_is_better !== undefined
            ? cfg.lower_is_better
            : task.lower_is_better !== undefined
              ? task.lower_is_better
              : undefined,
        minutes_requested:
          cfg.minutes_requested || task.minutes_requested || undefined,
      };

      const response = await fetchWithAuth(
        chatAPI.Endpoints.ComputeProvider.LaunchTemplate(providerId),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      let launchResult: any = {};
      try {
        launchResult = await response.json();
      } catch {
        launchResult = {};
      }

      if (response.ok && launchResult?.status === 'success') {
        const newId = String(launchResult.job_id);
        const pending = getPendingJobIds();
        if (!pending.includes(newId)) {
          setPendingJobIds([newId, ...pending]);
        }
        setTimeout(() => jobsMutate(), 0);

        addNotification({
          type: 'success',
          message: 'Provider cluster launch initiated.',
        });
        await Promise.all([jobsMutate(), templatesMutate()]);
      } else {
        const message =
          launchResult?.detail ||
          launchResult?.message ||
          'Failed to queue provider-backed task.';
        addNotification({
          type: 'danger',
          message,
        });
      }
    } catch (e) {
      console.error(e);
      addNotification({
        type: 'danger',
        message: 'Failed to queue provider-backed task.',
      });
    }
  };

  const handleEditTask = (task: any) => {
    setTaskBeingEdited(task);
    setEditModalOpen(true);
  };

  const getInteractiveTypeLabel = (interactiveType: string) => {
    switch (interactiveType) {
      case 'jupyter':
        return 'Jupyter';
      case 'vllm':
        return 'vLLM';
      case 'ollama':
        return 'Ollama';
      case 'ssh':
        return 'SSH';
      case 'vscode':
      default:
        return 'VS Code';
    }
  };

  const getInteractiveTypeColor = (
    interactiveType: string,
  ): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' => {
    switch (interactiveType) {
      case 'jupyter':
        return 'warning';
      case 'vllm':
        return 'success';
      case 'ollama':
        return 'primary';
      case 'ssh':
        return 'danger';
      case 'vscode':
      default:
        return 'primary';
    }
  };

  const handleViewInteractive = (jobId: number) => {
    setInteractiveJobForModal(jobId);
  };

  const loading = templatesIsLoading || jobsIsLoading;

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <NewInteractiveTaskModal
        open={interactiveModalOpen}
        onClose={() => setInteractiveModalOpen(false)}
        onSubmit={(data, shouldLaunch) =>
          handleSubmitInteractive(data, shouldLaunch)
        }
        isSubmitting={isSubmitting}
        providers={providers}
        isProvidersLoading={providersIsLoading}
      />
      {taskBeingEdited && (
        <EditInteractiveTaskModal
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setTaskBeingEdited(null);
          }}
          task={taskBeingEdited}
          providers={providers}
          isProvidersLoading={providersIsLoading}
          onSaved={async (updatedBody: any) => {
            if (!experimentInfo?.id || !taskBeingEdited?.id) {
              addNotification({
                type: 'warning',
                message: 'Missing experiment or task ID',
              });
              return;
            }

            try {
              const response = await chatAPI.authenticatedFetch(
                chatAPI.Endpoints.Task.UpdateTemplate(
                  experimentInfo.id,
                  taskBeingEdited.id,
                ),
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    accept: 'application/json',
                  },
                  body: JSON.stringify(updatedBody),
                },
              );

              if (response.ok) {
                await templatesMutate();
                addNotification({
                  type: 'success',
                  message: 'Interactive task updated successfully',
                });
              } else {
                const txt = await response.text();
                addNotification({
                  type: 'danger',
                  message: `Failed to update interactive task: ${txt}`,
                });
              }
            } catch (error) {
              console.error('Error updating interactive task:', error);
              addNotification({
                type: 'danger',
                message: 'Failed to update interactive task. Please try again.',
              });
            }
          }}
        />
      )}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
      >
        <Typography level="title-md">Running Services</Typography>
        <Button
          startDecorator={<TerminalIcon />}
          onClick={() => setInteractiveModalOpen(true)}
        >
          New
        </Button>
      </Stack>
      <Sheet
        variant="soft"
        sx={{
          px: 2,
          py: 2,
          mt: 1,
          mb: 2,
          flex: 1,
          height: '100%',
          overflow: 'auto',
        }}
      >
        {jobsIsLoading ? (
          <LinearProgress />
        ) : jobsWithPlaceholders.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
              textAlign: 'center',
            }}
          >
            <Typography level="body-lg" sx={{ mb: 2 }}>
              No interactive jobs yet
            </Typography>
            <Typography level="body-sm" color="neutral">
              Create a new interactive job to get started
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(4, 1fr)',
              },
              gap: 2,
            }}
          >
            {jobsWithPlaceholders.map((job: any) => {
              const jobData = job.job_data || {};
              const interactiveType =
                jobData.interactive_type ||
                (typeof jobData === 'string'
                  ? JSON.parse(jobData || '{}')?.interactive_type
                  : null) ||
                'vscode';

              return (
                <Card key={job.id} variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                      >
                        <Typography
                          level="title-md"
                          sx={{ flex: 1, minWidth: 0 }}
                        >
                          {jobData.cluster_name ||
                            jobData.template_name ||
                            `Job ${job.id}`}
                        </Typography>
                        <Chip
                          variant="soft"
                          color={jobChipColor(job.status)}
                          size="sm"
                        >
                          {job.status}
                        </Chip>
                        <Chip
                          variant="soft"
                          color={getInteractiveTypeColor(interactiveType)}
                          size="sm"
                        >
                          {getInteractiveTypeLabel(interactiveType)}
                        </Chip>
                      </Stack>
                      <Box>
                        <JobProgress job={job} />
                      </Box>
                      {jobData.start_time && (
                        <Typography level="body-xs" color="neutral">
                          Started:{' '}
                          {dayjs
                            .utc(jobData.start_time)
                            .local()
                            .format('MMM D, YYYY HH:mm:ss')}
                        </Typography>
                      )}
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="flex-end"
                      >
                        {job.status === 'INTERACTIVE' &&
                          (interactiveType === 'vscode' ||
                            interactiveType === 'jupyter' ||
                            interactiveType === 'vllm' ||
                            interactiveType === 'ollama' ||
                            interactiveType === 'ssh') && (
                            <Button
                              variant="soft"
                              color="primary"
                              size="sm"
                              onClick={() =>
                                handleViewInteractive(parseInt(job.id))
                              }
                            >
                              Interactive Setup
                            </Button>
                          )}
                        <IconButton
                          variant="plain"
                          color="danger"
                          size="sm"
                          onClick={() => handleDeleteJob(String(job.id))}
                        >
                          <Trash2Icon size={16} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Sheet>
      <Typography level="title-md">History</Typography>
      <Sheet
        variant="soft"
        sx={{
          px: 1,
          mt: 1,
          mb: 2,
          flex: 1,
          maxHeight: '300px',
          overflow: 'auto',
        }}
      >
        {templatesIsLoading ? (
          <LinearProgress />
        ) : (
          <TaskTemplateList
            tasksList={tasks}
            onDeleteTask={handleDeleteTask}
            onQueueTask={handleQueue}
            onEditTask={handleEditTask}
          />
        )}
      </Sheet>
      <ViewOutputModalStreaming
        jobId={viewOutputFromJob}
        setJobId={(jobId: number) => setViewOutputFromJob(jobId)}
      />
      {(() => {
        const job = jobs.find(
          (j: any) => String(j.id) === String(interactiveJobForModal),
        );
        const interactiveType =
          job?.job_data?.interactive_type ||
          (typeof job?.job_data === 'string'
            ? JSON.parse(job?.job_data || '{}')?.interactive_type
            : null) ||
          'vscode';

        if (interactiveType === 'jupyter') {
          return (
            <InteractiveJupyterModal
              jobId={interactiveJobForModal}
              setJobId={(jobId: number) => setInteractiveJobForModal(jobId)}
            />
          );
        }

        if (interactiveType === 'vllm') {
          return (
            <InteractiveVllmModal
              jobId={interactiveJobForModal}
              setJobId={(jobId: number) => setInteractiveJobForModal(jobId)}
            />
          );
        }

        if (interactiveType === 'ssh') {
          return (
            <InteractiveSshModal
              jobId={interactiveJobForModal}
              setJobId={(jobId: number) => setInteractiveJobForModal(jobId)}
            />
          );
        }

        if (interactiveType === 'ollama') {
          return (
            <InteractiveOllamaModal
              jobId={interactiveJobForModal}
              setJobId={(jobId: number) => setInteractiveJobForModal(jobId)}
            />
          );
        }

        return (
          <InteractiveVSCodeModal
            jobId={interactiveJobForModal}
            setJobId={(jobId: number) => setInteractiveJobForModal(jobId)}
          />
        );
      })()}
    </Sheet>
  );
}
