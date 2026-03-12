import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';
import { Button, Stack, Typography, Box, Skeleton } from '@mui/joy';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { PlusIcon } from 'lucide-react';
import { useSWRWithAuth as useSWR, useAPI } from 'renderer/lib/authContext';
import { useNavigate } from 'react-router-dom';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';
import TaskTemplateList from '../Tasks/TaskTemplateList';
import NewInteractiveTaskModal from '../Tasks/NewInteractiveTaskModal';
import EditInteractiveTaskModal from '../Tasks/EditInteractiveTaskModal';
import DeleteTaskConfirmModal from '../Tasks/DeleteTaskConfirmModal';
import InteractiveJobCard from './InteractiveJobCard';

const duration = require('dayjs/plugin/duration');

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function Interactive() {
  const [interactiveModalOpen, setInteractiveModalOpen] = useState(false);
  const [interactiveModalError, setInteractiveModalError] = useState<
    string | null
  >(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [taskBeingEdited, setTaskBeingEdited] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<{
    id: string;
    name?: string;
  } | null>(null);

  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();
  const { fetchWithAuth, team } = useAuth();
  const navigate = useNavigate();

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
    const raw = window.localStorage.getItem(pendingJobsStorageKey);
    if (!raw) return [];
    const parsed = SafeJSONParse(raw, []);
    const result = Array.isArray(parsed) ? parsed : [];
    return result;
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

    // Show active interactive jobs (INTERACTIVE, RUNNING, LAUNCHING)
    const filteredJobs = baseJobs.filter((job: any) => {
      return (
        job.status === 'INTERACTIVE' ||
        job.status === 'RUNNING' ||
        job.status === 'LAUNCHING'
      );
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

  const handleDeleteTask = (taskId: string, taskName?: string) => {
    setTaskToDelete({ id: taskId, name: taskName });
  };

  const handleConfirmDeleteTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      if (!experimentInfo?.id) return false;
      try {
        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.DeleteTemplate(experimentInfo.id, taskId),
          { method: 'GET' },
        );
        if (response.ok) {
          addNotification({
            type: 'success',
            message: 'Template deleted successfully!',
          });
          await templatesMutate();
          return true;
        }
        addNotification({
          type: 'danger',
          message: 'Failed to delete template. Please try again.',
        });
        return false;
      } catch (error) {
        console.error('Error deleting template:', error);
        addNotification({
          type: 'danger',
          message: 'Failed to delete template. Please try again.',
        });
        return false;
      }
    },
    [experimentInfo?.id, addNotification, templatesMutate],
  );

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
    setInteractiveModalError(null);
    try {
      const interactiveType = data.interactive_type || 'vscode';

      // Fetch interactive gallery to get setup and run templates
      let defaultSetup: string;
      let defaultRun: string;
      let templateId: string | undefined;
      let template: any;
      let galleryTemplate: any = null;

      try {
        const galleryResponse = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.InteractiveGallery(experimentInfo.id),
          {
            method: 'GET',
          },
        );

        if (galleryResponse.ok) {
          const galleryData = await galleryResponse.json();
          template = galleryData.data?.find((t: any) => {
            if (data.template_id) {
              return t.id === data.template_id;
            }
            return t.interactive_type === interactiveType;
          });

          if (!template) {
            throw new Error(
              `Template not found for interactive type: ${interactiveType}`,
            );
          }

          defaultSetup = template.setup || '';
          defaultRun = template.run || template.command || '';
          templateId = template.id;
          galleryTemplate = template;
        } else {
          throw new Error('Failed to fetch interactive gallery');
        }
      } catch (error) {
        throw error;
      }

      let response: Response;
      let templatePayload: any = {};

      if (template.local_task_dir || template.github_repo_url) {
        // Use the gallery import API which reads task.yaml and copies files,
        // just like the "Upload from Local Directory" or GitHub import flow.
        response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.ImportFromGallery(experimentInfo.id),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gallery_id: templateId,
              experiment_id: experimentInfo.id,
              is_interactive: true,
              env_vars: data.env_parameters || undefined,
            }),
          },
        );

      } else {
        // Create template with flat structure
        // Use env_parameters from the gallery-defined structure
        const envVars: Record<string, string> = data.env_parameters || {};

        const needsNgrok =
          interactiveType === 'jupyter' ||
          interactiveType === 'vllm' ||
          interactiveType === 'ollama' ||
          interactiveType === 'ssh';
        if (
          needsNgrok &&
          providerMeta.type !== 'local' &&
          !envVars.NGROK_AUTH_TOKEN
        ) {
          envVars.NGROK_AUTH_TOKEN = '{{secret._NGROK_AUTH_TOKEN}}';
        }

        templatePayload = {
          name: data.title,
          type: 'REMOTE',
          plugin: 'remote_orchestrator',
          experiment_id: experimentInfo.id,
          cluster_name: data.title,
          run: defaultRun,
          cpus: data.cpus || undefined,
          memory: data.memory || undefined,
          accelerators: data.accelerators || undefined,
          setup: defaultSetup,
          subtype: 'interactive',
          interactive_type: interactiveType,
          interactive_gallery_id: templateId,
          provider_id: providerMeta.id,
          provider_name: providerMeta.name,
          env_vars: Object.keys(envVars).length > 0 ? envVars : undefined,
          github_repo_url: galleryTemplate?.github_repo_url || undefined,
          github_directory: galleryTemplate?.github_repo_dir || undefined,
        };

        response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.NewTemplate(experimentInfo?.id || ''),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(templatePayload),
          },
        );
      }

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

        if (shouldLaunch) {
          if (!taskId) {
            setInteractiveModalError(
              'Template was created, but no task ID was returned. Please refresh and try launching from the task list.',
            );
            return;
          }

          // Construct task object for launching. For local_task_dir imports
          // the task metadata lives in the backend, so find it from the
          // refreshed list instead of the (empty) templatePayload.
          const refreshed = await templatesMutate();
          const taskList = Array.isArray(refreshed)
            ? refreshed
            : (refreshed as any)?.data || [];
          const newTask = taskList.find((t: any) => t.id === taskId) || {
            id: taskId,
            ...templatePayload,
          };

          // Launch the task immediately. If launch fails (e.g. missing secrets),
          // keep the modal open and show the error inline.
          const launch = await launchInteractiveTask(newTask);
          if (!launch.ok) {
            setInteractiveModalError(launch.error);
            return;
          }

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
        setInteractiveModalError(
          `Failed to create interactive template: ${txt}`,
        );
      }
    } catch (error) {
      console.error('Error creating interactive template:', error);
      setInteractiveModalError(
        'Failed to create interactive template. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const launchInteractiveTask = useCallback(
    async (task: any): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!experimentInfo?.id) {
        return { ok: false, error: 'No experiment selected.' };
      }

      const cfg =
        task.config !== undefined ? SafeJSONParse(task.config, task) : task;

      const providerId =
        cfg.provider_id ||
        task.provider_id ||
        (providers.length ? providers[0]?.id : null);
      if (!providerId) {
        return {
          ok: false,
          error:
            'No providers available. Add a provider in the team settings first.',
        };
      }

      const providerMeta = providers.find(
        (provider) => provider.id === providerId,
      );

      if (!providerMeta) {
        return {
          ok: false,
          error:
            'Selected provider is unavailable. Please create or update providers in team settings.',
        };
      }

      if (!cfg.run && !cfg.github_repo_url && !task.github_repo_url) {
        return { ok: false, error: 'Task is missing a command to run.' };
      }

      const payload = {
        experiment_id: experimentInfo.id,
        task_id: task.id,
        task_name: task.name,
        cluster_name: cfg.cluster_name || task.cluster_name,
        run: cfg.run || task.run,
        subtype: cfg.subtype || task.subtype,
        interactive_type: cfg.interactive_type || task.interactive_type,
        interactive_gallery_id:
          cfg.interactive_gallery_id ??
          task?.interactive_gallery_id ??
          undefined,
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
        github_repo_dir:
          cfg.github_repo_dir ||
          cfg.github_directory ||
          task.github_repo_dir ||
          task.github_directory,
        github_repo_branch:
          cfg.github_repo_branch ||
          cfg.github_branch ||
          task.github_repo_branch ||
          task.github_branch,
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

      try {
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

        if (
          response.ok &&
          (launchResult?.status === 'success' ||
            (launchResult?.status === 'WAITING' && launchResult?.job_id))
        ) {
          const newId = String(launchResult.job_id);
          const pending = getPendingJobIds();
          if (!pending.includes(newId)) {
            setPendingJobIds([newId, ...pending]);
          }
          setTimeout(() => jobsMutate(), 0);
          await Promise.all([jobsMutate(), templatesMutate()]);
          return { ok: true };
        }

        const message =
          launchResult?.detail ||
          launchResult?.message ||
          'Failed to queue provider-backed task.';
        return { ok: false, error: String(message) };
      } catch (e: any) {
        console.error(e);
        return { ok: false, error: 'Failed to queue provider-backed task.' };
      }
    },
    [
      experimentInfo?.id,
      fetchWithAuth,
      getPendingJobIds,
      jobsMutate,
      providers,
      setPendingJobIds,
      templatesMutate,
    ],
  );

  const handleQueue = async (task: any) => {
    if (!experimentInfo?.id) return;

    const cfg =
      task.config !== undefined ? SafeJSONParse(task.config, task) : task;

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

    if (!cfg.run && !cfg.github_repo_url && !task.github_repo_url) {
      addNotification({
        type: 'warning',
        message: 'Task is missing a run command.',
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
        task_id: task.id,
        task_name: task.name,
        cluster_name: cfg.cluster_name || task.cluster_name,
        run: cfg.run || task.run,
        subtype: cfg.subtype || task.subtype,
        interactive_type: cfg.interactive_type || task.interactive_type,
        interactive_gallery_id:
          cfg.interactive_gallery_id ??
          task?.interactive_gallery_id ??
          undefined,
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
        github_repo_dir:
          cfg.github_repo_dir ||
          cfg.github_directory ||
          task.github_repo_dir ||
          task.github_directory,
        github_repo_branch:
          cfg.github_repo_branch ||
          cfg.github_branch ||
          task.github_repo_branch ||
          task.github_branch,
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

      if (
        response.ok &&
        (launchResult?.status === 'success' ||
          (launchResult?.status === 'WAITING' && launchResult?.job_id))
      ) {
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
        onClose={() => {
          setInteractiveModalOpen(false);
          setInteractiveModalError(null);
        }}
        submitError={interactiveModalError}
        onClearSubmitError={() => setInteractiveModalError(null)}
        onSubmit={(data, shouldLaunch) =>
          handleSubmitInteractive(data, shouldLaunch)
        }
        isSubmitting={isSubmitting}
        providers={providers}
        isProvidersLoading={providersIsLoading}
        importedTasks={tasks}
        onDeleteTask={handleDeleteTask}
        onQueueTask={handleQueue}
        onRefreshTasks={templatesMutate}
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
          startDecorator={<PlusIcon size={16} />}
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
        {(jobsIsLoading || !experimentInfo?.id) && (
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
            <Skeleton variant="rectangular" height={100} width={100} />
          </Box>
        )}
        {!jobsIsLoading &&
          experimentInfo?.id &&
          jobsWithPlaceholders.length === 0 && (
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
              <Typography level="body-sm" color="neutral" sx={{ mb: 1 }}>
                Interactive jobs are long running services like an Inference
                Server, VS Code or Jupyter notebook.
              </Typography>
              <Typography level="body-sm" color="neutral">
                Import an interactive task from the gallery and then queue it to
                start.
              </Typography>
            </Box>
          )}
        {!jobsIsLoading && jobsWithPlaceholders.length > 0 && (
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
            {jobsWithPlaceholders.map((job: any) => (
              <InteractiveJobCard
                key={job.id}
                job={job}
                onDeleteJob={handleDeleteJob}
              />
            ))}
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
        <TaskTemplateList
          tasksList={tasks}
          onDeleteTask={handleDeleteTask}
          onQueueTask={handleQueue}
          onEditTask={handleEditTask}
          loading={templatesIsLoading || !experimentInfo?.id}
          interactTasks
        />
      </Sheet>
      <DeleteTaskConfirmModal
        open={taskToDelete !== null}
        onClose={() => setTaskToDelete(null)}
        taskId={taskToDelete?.id ?? null}
        taskName={taskToDelete?.name ?? null}
        onConfirm={handleConfirmDeleteTask}
      />
    </Sheet>
  );
}
