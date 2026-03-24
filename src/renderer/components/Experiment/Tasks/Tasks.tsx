import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';

import { Button, LinearProgress, Skeleton, Stack, Typography } from '@mui/joy';

import { PlusIcon, TerminalIcon } from 'lucide-react';
import { useSWRWithAuth as useSWR, useAPI } from 'renderer/lib/authContext';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import { analytics } from 'renderer/components/Shared/analytics/AnalyticsContext';
import TaskTemplateList from './TaskTemplateList';
import JobsList from './JobsList';
import NewInteractiveTaskModal from './NewInteractiveTaskModal';
import InteractiveModal from './InteractiveModal';
import EditInteractiveTaskModal from './EditInteractiveTaskModal';
import DeleteTaskConfirmModal from './DeleteTaskConfirmModal';
import QueueTaskModal from './QueueTaskModal';
import ViewOutputModalStreaming from './ViewOutputModalStreaming';
import ViewArtifactsModal from './ViewArtifactsModal';
import ViewProfilingModal from './ViewProfilingModal';
import ViewCheckpointsModal from './ViewCheckpointsModal';
import ViewEvalResultsModal from './ViewEvalResultsModal';
import CompareEvalResultsModal from './CompareEvalResultsModal';
import PreviewDatasetModal from '../../Data/PreviewDatasetModal';
import ViewSweepResultsModal from './ViewSweepResultsModal';
import ViewJobDatasetsModal from './ViewJobDatasetsModal';
import ViewJobModelsModal from './ViewJobModelsModal';
import FileBrowserModal from './FileBrowserModal';
import SafeJSONParse from '../../Shared/SafeJSONParse';
import NewTaskModal2 from './NewTaskModal/NewTaskModal2';
import TaskYamlEditorModal from './TaskYamlEditorModal';
import TrackioModal from './TrackioModal';

const duration = require('dayjs/plugin/duration');
const dayjs = require('dayjs');

dayjs.extend(duration);

export default function Tasks({ subtype }: { subtype?: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [interactiveModalOpen, setInteractiveModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [taskBeingEdited, setTaskBeingEdited] = useState<any | null>(null);
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [taskBeingQueued, setTaskBeingQueued] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewOutputFromJob, setViewOutputFromJob] = useState<string | null>(
    null,
  );
  const [viewCheckpointsFromJob, setViewCheckpointsFromJob] = useState<
    string | null
  >(null);
  const [viewArtifactsFromJob, setViewArtifactsFromJob] = useState<
    string | null
  >(null);
  const [viewProfilingFromJob, setViewProfilingFromJob] = useState<
    string | null
  >(null);
  const [viewEvalImagesFromJob, setViewEvalImagesFromJob] = useState<
    string | null
  >(null);
  const [viewOutputFromSweepJob, setViewOutputFromSweepJob] = useState(false);
  const [viewSweepResultsFromJob, setViewSweepResultsFromJob] = useState<
    string | null
  >(null);
  const [viewEvalResultsFromJob, setViewEvalResultsFromJob] = useState<
    string | null
  >(null);
  const [interactiveJobForModal, setInteractiveJobForModal] = useState<
    string | null
  >(null);
  const [viewJobDatasetsFromJob, setViewJobDatasetsFromJob] = useState<
    string | null
  >(null);
  const [viewJobModelsFromJob, setViewJobModelsFromJob] = useState<
    string | null
  >(null);
  const [previewDatasetModal, setPreviewDatasetModal] = useState<{
    open: boolean;
    datasetId: string | null;
  }>({ open: false, datasetId: null });
  const [trackioJobIdForModal, setTrackioJobIdForModal] = useState<
    string | null
  >(null);
  const [compareEvalJobIds, setCompareEvalJobIds] = useState<string[]>([]);
  const [isCompareSelectMode, setIsCompareSelectMode] = useState(false);
  const [compareEvalModalOpen, setCompareEvalModalOpen] = useState(false);
  const [viewFileBrowserFromJob, setViewFileBrowserFromJob] = useState<
    string | null
  >(null);
  const [viewTaskFilesFromTask, setViewTaskFilesFromTask] = useState<{
    id: string | null;
    name?: string | null;
  }>({ id: null, name: null });
  const [yamlEditorTaskId, setYamlEditorTaskId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<{
    id: string;
    name?: string;
  } | null>(null);
  const [launchProgressByJobId, setLaunchProgressByJobId] = useState<
    Record<string, { phase?: string; percent?: number; message?: string }>
  >({});
  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();
  const { fetchWithAuth, team } = useAuth();

  // Trigger to force re-render when localStorage changes (minimal state to avoid interfering with useSWR)
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

  // Pending job IDs persisted per experiment to show immediate placeholders
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
        // Trigger re-render by updating counter
        setPendingIdsTrigger((prev) => prev + 1);
      } catch {
        // ignore storage failures
      }
    },
    [pendingJobsStorageKey],
  );

  // Listen for localStorage changes to pick up pending job IDs from other tabs/windows
  // Using storage event to avoid interfering with useSWR polling
  useEffect(() => {
    // Listen for storage events (works across tabs/windows)
    // Note: storage event only fires for changes from OTHER tabs, not same tab
    // Same-tab changes are handled by setPendingJobIds which updates trigger directly
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === pendingJobsStorageKey) {
        // Trigger re-render by updating counter
        setPendingIdsTrigger((prev) => prev + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pendingJobsStorageKey]);

  // Listen for custom event to open job output modal from interactive modals
  useEffect(() => {
    const handleOpenJobOutput = (e: Event) => {
      const customEvent = e as CustomEvent<{ jobId?: unknown }>;
      const rawJobId = customEvent.detail?.jobId;
      const jobIdStr =
        rawJobId === null || rawJobId === undefined ? '' : String(rawJobId);
      if (jobIdStr && jobIdStr !== '-1' && jobIdStr !== 'NaN') {
        // Close the interactive modal first
        setInteractiveJobForModal(null);
        // Wait for the modal to close (MUI modals have transition animations)
        // Use a longer delay to ensure the interactive modal fully closes
        // before opening the output modal to avoid z-index/stacking issues
        setTimeout(() => {
          setViewOutputFromJob(jobIdStr);
        }, 300); // 300ms should be enough for modal close animation
      }
    };

    const eventName = 'tflab-open-job-output';
    window.addEventListener(eventName, handleOpenJobOutput);

    return () => {
      window.removeEventListener(eventName, handleOpenJobOutput);
    };
  }, []);

  const isInteractivePage = subtype === 'interactive';

  const isInteractiveTemplate = useCallback((task: any): boolean => {
    const config =
      typeof task?.config === 'string'
        ? SafeJSONParse(task.config, {})
        : (task?.config ?? {});
    return (
      (task as any)?.subtype === 'interactive' ||
      config?.subtype === 'interactive' ||
      Boolean((task as any)?.interactive_type) ||
      Boolean(config?.interactive_type)
    );
  }, []);

  const isInteractiveJob = useCallback((job: any): boolean => {
    const jobData = job?.job_data || {};
    return jobData?.subtype === 'interactive' || job?.status === 'INTERACTIVE';
  }, []);

  const handleOpen = () => {
    if (isInteractivePage) {
      setInteractiveModalOpen(true);
    } else {
      setModalOpen(true);
    }
  };
  const handleClose = () => setModalOpen(false);
  const handleEditClose = () => {
    setEditModalOpen(false);
    setTaskBeingEdited(null);
  };

  // Fetch REMOTE jobs with automatic polling
  const {
    data: jobsRemote,
    isError: jobsIsError,
    isLoading: jobsIsLoading,
    mutate: jobsMutate,
  } = useSWR(
    experimentInfo?.id
      ? subtype
        ? chatAPI.Endpoints.Jobs.ListWithFilters(
            experimentInfo.id,
            'REMOTE',
            '',
            subtype,
          )
        : chatAPI.Endpoints.Jobs.GetJobsOfType(experimentInfo.id, 'REMOTE', '')
      : null,
    fetcher,
    {
      refreshInterval: 3000, // Poll every 3 seconds for job status updates
      revalidateOnFocus: false, // Don't refetch when window regains focus
      revalidateOnReconnect: true, // Refetch when network reconnects
      refreshWhenHidden: true, // Continue polling even when tab is hidden
      refreshWhenOffline: false, // Don't poll when offline
    },
  );

  // Fetch SWEEP jobs using sweep-status endpoint (status is updated by backend background worker)
  const { data: sweepStatusData, mutate: jobsSweepMutate } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.ComputeProvider.CheckSweepStatus(experimentInfo.id)
      : null,
    fetcher,
    {
      refreshInterval: 10000,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshWhenHidden: true,
      refreshWhenOffline: false,
    },
  );

  // Extract SWEEP jobs from the sweep-status response
  const jobsSweep = useMemo(() => {
    if (
      sweepStatusData?.status === 'success' &&
      Array.isArray(sweepStatusData.jobs)
    ) {
      return sweepStatusData.jobs;
    }
    return [];
  }, [sweepStatusData]);

  // Combine REMOTE and SWEEP jobs (SWEEP jobs first)
  const jobs = useMemo(() => {
    const remoteJobs = Array.isArray(jobsRemote) ? jobsRemote : [];
    const sweepJobs = Array.isArray(jobsSweep) ? jobsSweep : [];
    return [...sweepJobs, ...remoteJobs];
  }, [jobsRemote, jobsSweep]);

  // Fetch templates with useSWR (templates replace remote tasks)
  const {
    data: allTemplates,
    isError: templatesIsError,
    isLoading: templatesIsLoading,
    mutate: templatesMutate,
  } = useSWR(
    experimentInfo?.id
      ? subtype
        ? chatAPI.Endpoints.Task.ListBySubtypeInExperiment(
            experimentInfo.id,
            subtype,
            'REMOTE', // Filter by REMOTE type when filtering by subtype
          )
        : chatAPI.Endpoints.Task.List(experimentInfo.id)
      : null,
    fetcher,
    {
      // Tasks (templates) change relatively infrequently; use a modest polling interval
      // and rely on backend cache + explicit invalidation for freshness.
      refreshInterval: 10000, // 10s
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    },
  );

  // Filter templates for this experiment only (if no subtype filter was applied)
  const tasks =
    (Array.isArray(allTemplates) ? allTemplates : allTemplates?.data || []) // in case API returns {data: []}
      ?.filter((template: any) => {
        // If subtype filter was applied via API, just filter by experiment
        // Otherwise, filter by experiment only
        return template.experiment_id === experimentInfo?.id;
      }) || [];

  const visibleTasks = useMemo(() => {
    if (subtype) return tasks;
    return tasks.filter((t: any) => !isInteractiveTemplate(t));
  }, [isInteractiveTemplate, subtype, tasks]);

  // Poll LAUNCHING/WAITING REMOTE jobs for live launch_progress and status transitions.
  // Provider polling and status mutations are handled server-side by the
  // remote_job_status_service background worker. This effect only reads current
  // state, so each poll is a fast filesystem read with no provider latency risk.
  useEffect(() => {
    if (!jobs || !Array.isArray(jobs)) return;

    // Only poll jobs that are actively in-flight (LAUNCHING or WAITING).
    // Quota recording and terminal-state transitions are handled by the background worker.
    const jobsToCheck = jobs.filter(
      (job: any) =>
        job.type === 'REMOTE' &&
        job.job_data?.provider_id &&
        (job.status === 'LAUNCHING' || job.status === 'WAITING'),
    );

    if (jobsToCheck.length === 0) return;

    const checkJobs = async () => {
      for (const job of jobsToCheck) {
        try {
          const response = await fetchWithAuth(
            chatAPI.Endpoints.ComputeProvider.CheckJobStatus(String(job.id)),
            { method: 'GET' },
          );
          if (response.ok) {
            const result = await response.json();
            // If the background worker has transitioned the job to a terminal state,
            // refresh the jobs list so the UI reflects the new status.
            if (
              result.current_status === 'COMPLETE' ||
              result.current_status === 'FAILED' ||
              result.current_status === 'STOPPED'
            ) {
              setTimeout(() => jobsMutate(), 0);
            }
            if (result.launch_progress) {
              setLaunchProgressByJobId((prev) => ({
                ...prev,
                [String(job.id)]: result.launch_progress,
              }));
            }
          }
        } catch (error) {
          // Silently ignore errors for individual job checks
          console.error(`Failed to check job ${job.id}:`, error);
        }
      }
    };

    // Poll every 3s while jobs are in-flight.
    checkJobs();
    const interval = setInterval(checkJobs, 3000);

    return () => clearInterval(interval);
  }, [jobs, fetchWithAuth, jobsMutate]);

  // // Periodically ensure quota is recorded for all completed REMOTE jobs
  // useEffect(() => {
  //   if (!experimentInfo?.id) return;

  //   const ensureQuotaRecorded = async () => {
  //     try {
  //       const response = await fetchWithAuth(
  //         chatAPI.Endpoints.ComputeProvider.EnsureQuotaRecorded(
  //           experimentInfo.id,
  //         ),
  //         { method: 'GET' },
  //       );
  //       if (response.ok) {
  //         const result = await response.json();
  //         // If any quota was recorded, refresh jobs to reflect changes
  //         if (result.jobs_with_quota_recorded > 0) {
  //           setTimeout(() => jobsMutate(), 0);
  //         }
  //       }
  //     } catch (error) {
  //       // Silently ignore errors for quota recording check
  //       console.error('Failed to ensure quota recorded:', error);
  //     }
  //   };

  //   // Check immediately and then every 30 seconds (less frequent than job status checks)
  //   ensureQuotaRecorded();
  //   const interval = setInterval(ensureQuotaRecorded, 30000);

  //   return () => clearInterval(interval);
  // }, [experimentInfo?.id, fetchWithAuth, jobsMutate]);

  const loading = templatesIsLoading || jobsIsLoading;

  // Remove any pending placeholders that are now present in jobs
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

  // Build list with placeholders for pending job IDs not yet in jobs
  // If subtype is provided, filter jobs by subtype in job_data
  const jobsWithPlaceholders = useMemo(() => {
    const baseJobs = Array.isArray(jobs) ? jobs : [];
    let filteredJobs = baseJobs;

    // Filter by subtype if provided
    if (subtype) {
      filteredJobs = baseJobs.filter((job: any) => {
        const jobData = job.job_data || {};
        return jobData.subtype === subtype;
      });
    } else {
      filteredJobs = baseJobs.filter((job: any) => !isInteractiveJob(job));
    }

    // Read directly from localStorage to avoid state dependency issues
    // The pendingIdsTrigger ensures this recalculates when localStorage changes
    const pending = getPendingJobIds();

    if (!pending.length) return filteredJobs;

    // Check against ALL jobs (not just filtered) to see if pending IDs exist
    // This ensures placeholders are removed once the job appears in the API response,
    // regardless of whether it matches the current subtype filter
    const allExistingIds = new Set(baseJobs.map((j: any) => String(j.id)));

    // Create placeholders for pending IDs that don't exist in the full jobs list yet
    const placeholders = pending
      .filter((id) => !allExistingIds.has(String(id)))
      .map((id) => ({
        id: String(id),
        type: 'REMOTE',
        status: 'CREATED',
        progress: 0,
        job_data: subtype ? { subtype } : {},
        placeholder: true,
      }));

    // Show newest first consistent with existing ordering if any
    const combined = [...placeholders, ...filteredJobs];
    return combined;
  }, [getPendingJobIds, isInteractiveJob, jobs, pendingIdsTrigger, subtype]);

  const handleDeleteTask = (taskId: string, taskName?: string) => {
    setTaskToDelete({ id: taskId, name: taskName });
  };

  const handleConfirmDeleteTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      if (!experimentInfo?.id) return false;
      try {
        const response = await fetchWithAuth(
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
    [experimentInfo?.id, addNotification, templatesMutate, fetchWithAuth],
  );

  const handleDeleteJob = async (jobId: string) => {
    if (!experimentInfo?.id) return;

    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }

    try {
      const response = await fetchWithAuth(
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
        // Refresh the data to remove the deleted job
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

  const handleExportToTeamGallery = async (taskId: string) => {
    try {
      const response = await fetchWithAuth(
        chatAPI.Endpoints.Task.ExportToTeamGallery(experimentInfo?.id || ''),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ task_id: taskId }),
        },
      );

      if (!response.ok) {
        const txt = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to export template: ${txt}`,
        });
        return;
      }

      const result = await response.json();
      addNotification({
        type: 'success',
        message: result?.message || 'Template exported to team gallery.',
      });
    } catch (error) {
      console.error('Error exporting template:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to export template. Please try again.',
      });
    }
  };

  const handleSubmit = async (data: any) => {
    if (!experimentInfo?.id) {
      addNotification({ type: 'warning', message: 'No experiment selected' });
      return;
    }

    if (!data.provider_id) {
      addNotification({
        type: 'warning',
        message: 'Select a provider before creating a task.',
      });
      return;
    }

    const providerMeta = providers.find(
      (provider) => provider.id === data.provider_id,
    );

    if (!providerMeta) {
      addNotification({
        type: 'danger',
        message:
          'Selected provider is unavailable. Please refresh or choose another provider.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Create a template with all fields stored directly (flat structure)
      const templatePayload: any = {
        name: data.title,
        type: 'REMOTE',
        plugin: 'remote_orchestrator',
        experiment_id: experimentInfo.id,
        cluster_name: data.cluster_name,
        run: data.run,
        cpus: data.cpus || undefined,
        memory: data.memory || undefined,
        disk_space: data.disk_space || undefined,
        accelerators: data.accelerators || undefined,
        num_nodes: data.num_nodes || undefined,
        setup: data.setup || undefined,
        env_vars: data.env_vars || undefined,
        parameters: data.parameters || undefined,
        file_mounts: data.file_mounts || undefined,
        github_repo_url: data.github_repo_url || undefined,
        github_repo_dir:
          data.github_repo_dir || data.github_directory || undefined,
        github_repo_branch:
          data.github_repo_branch || data.github_branch || undefined,
        run_sweeps: data.run_sweeps || undefined,
        sweep_config: data.sweep_config || undefined,
        sweep_metric:
          data.sweep_metric || (data.run_sweeps ? 'eval/loss' : undefined),
        lower_is_better:
          data.lower_is_better !== undefined ? data.lower_is_better : undefined,
        provider_id: providerMeta.id,
        provider_name: providerMeta.name,
      };

      // Add subtype if provided
      if (subtype) {
        templatePayload.subtype = subtype;
      }

      const response = await fetchWithAuth(
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
        analytics.track('Task Queued', {
          task_type: 'REMOTE',
        });
        setModalOpen(false);
        await templatesMutate();
        addNotification({
          type: 'success',
          message: 'Template created. Use Queue to launch remotely.',
        });
      } else {
        const txt = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to create template: ${txt}`,
        });
      }
    } catch (error) {
      console.error('Error creating template:', error);
      addNotification({
        type: 'danger',
        message: 'Failed to create template. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitInteractive = async (data: any) => {
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
      // Fetch interactive gallery to get setup and run templates
      let defaultSetup: string;
      let defaultRun: string;
      let templateId: string | undefined;
      let template: any;

      try {
        const galleryResponse = await fetchWithAuth(
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
            return (
              data.interactive_type &&
              t.interactive_type === data.interactive_type
            );
          });

          if (!template) {
            throw new Error(
              `Template not found for: ${data.template_id || data.interactive_type || 'unknown'}`,
            );
          }

          defaultSetup = template.setup || '';
          defaultRun = template.run || template.command || '';
          templateId = template.id;
        } else {
          throw new Error('Failed to fetch interactive gallery');
        }
      } catch (error) {
        throw error;
      }

      let response: Response;

      if (template.local_task_dir || template.github_repo_url) {
        // Use the gallery import API which reads task.yaml and copies files,
        // just like the "Upload from Local Directory" or GitHub import flow.
        response = await fetchWithAuth(
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
        // Use env_parameters from the gallery-defined structure (including NGROK)
        const envVars: Record<string, string> = data.env_parameters || {};

        // Check if the template defines NGROK_AUTH_TOKEN in its env_parameters
        const needsNgrok = template?.env_parameters?.some(
          (p: any) => p.env_var === 'NGROK_AUTH_TOKEN',
        );
        if (
          needsNgrok &&
          providerMeta.type !== 'local' &&
          !envVars.NGROK_AUTH_TOKEN
        ) {
          envVars.NGROK_AUTH_TOKEN = '{{secret._NGROK_AUTH_TOKEN}}';
        }

        const templatePayload: any = {
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
          interactive_type: template?.interactive_type || undefined,
          interactive_gallery_id: templateId,
          provider_id: providerMeta.id,
          provider_name: providerMeta.name,
          env_vars: Object.keys(envVars).length > 0 ? envVars : undefined,
          github_repo_url: template?.github_repo_url || undefined,
          github_directory: template?.github_repo_dir || undefined,
        };

        response = await fetchWithAuth(
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
        setInteractiveModalOpen(false);
        await templatesMutate();
        const interactiveTypeLabel =
          template?.name || data.interactive_type || 'interactive';
        addNotification({
          type: 'success',
          message: `Interactive template created. Use Queue to launch the ${interactiveTypeLabel} tunnel.`,
        });
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

    // For templates, all fields are stored directly (not nested in config)
    // For backward compatibility, check if it's an old task format with nested config
    const cfg =
      task.config !== undefined ? SafeJSONParse(task.config, task) : task; // If no config field, assume it's a template with flat structure

    if (!providers.length) {
      addNotification({
        type: 'danger',
        message:
          'No providers available. Add a provider in the team settings first.',
      });
      return;
    }

    if (
      !cfg.run &&
      !task.run &&
      !cfg.github_repo_url &&
      !task.github_repo_url
    ) {
      addNotification({
        type: 'warning',
        message: 'Task is missing a run command.',
      });
      return;
    }

    // Open the queue modal so user can pick provider (and customize params)
    setTaskBeingQueued(task);
    setQueueModalOpen(true);
  };

  const handleQueueSubmit = async (config: Record<string, any>) => {
    if (!experimentInfo?.id || !taskBeingQueued) return;

    // Keep modal open while submission is in progress
    setIsSubmitting(true);

    const task = taskBeingQueued;

    // For templates, all fields are stored directly (not nested in config)
    // For backward compatibility, check if it's an old task format with nested config
    const cfg =
      task.config !== undefined ? SafeJSONParse(task.config, task) : task; // If no config field, assume it's a template with flat structure

    // Use provider from modal override first, then task/cfg
    const providerId =
      config?.provider_id ||
      cfg.provider_id ||
      task.provider_id ||
      (providers.length ? providers[0]?.id : null);

    const providerMeta = providers.find(
      (provider) => provider.id === providerId,
    );

    if (!providerMeta) {
      setIsSubmitting(false);
      addNotification({
        type: 'danger',
        message:
          'Selected provider is unavailable. Please create or update providers in team settings.',
      });
      return;
    }

    addNotification({
      type: 'success',
      message: 'Launching provider job...',
    });

    try {
      // Strip modal-only fields from config so API only gets parameter overrides
      const {
        provider_id: _pid,
        provider_name: _pname,
        enable_trackio,
        enable_profiling,
        enable_profiling_torch,
        cpus,
        memory,
        disk_space,
        accelerators,
        num_nodes,
        minutes_requested,
        ...paramConfig
      } = config ?? {};

      // For templates, fields are stored directly, so use task directly or cfg
      // Keep original parameters (the definitions/defaults) and send overrides separately
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
          (task as any)?.interactive_gallery_id ??
          config?.interactive_gallery_id ??
          undefined,
        cpus: cpus ?? cfg.cpus ?? task.cpus,
        memory: memory ?? cfg.memory ?? task.memory,
        disk_space: disk_space ?? cfg.disk_space ?? task.disk_space,
        accelerators: accelerators ?? cfg.accelerators ?? task.accelerators,
        num_nodes: num_nodes ?? cfg.num_nodes ?? task.num_nodes,
        setup: cfg.setup || task.setup,
        env_vars: cfg.env_vars || task.env_vars || {},
        parameters: cfg.parameters || task.parameters || undefined, // Keep original parameter definitions
        config: Object.keys(paramConfig).length > 0 ? paramConfig : undefined, // Send user's custom values as config
        file_mounts: cfg.file_mounts || task.file_mounts,
        provider_name: config?.provider_name ?? providerMeta.name,
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
          minutes_requested ??
          cfg.minutes_requested ??
          task.minutes_requested ??
          undefined,
        enable_trackio:
          typeof enable_trackio === 'boolean' ? enable_trackio : undefined,
        enable_profiling:
          typeof enable_profiling === 'boolean' ? enable_profiling : undefined,
        enable_profiling_torch:
          typeof enable_profiling_torch === 'boolean'
            ? enable_profiling_torch
            : undefined,
        trackio_project_name:
          config?.trackio_project_name != null
            ? config.trackio_project_name
            : undefined,
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
        setQueueModalOpen(false);
        await Promise.all([jobsMutate(), templatesMutate()]);
        // Close the queue modal only after the launch succeeds
        setTaskBeingQueued(null);
      } else {
        // FastAPI HTTPException uses 'detail' field, but some responses may use 'message'
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
    } finally {
      setIsSubmitting(false);
      // Ensure the queue modal closes when the launch request finishes,
      // regardless of success or failure.
      setQueueModalOpen(false);
      setTaskBeingQueued(null);
    }
  };

  const handleEditTask = (task: any) => {
    const config =
      typeof task?.config === 'string'
        ? SafeJSONParse(task.config, {})
        : (task?.config ?? {});
    const isInteractive =
      (task as any)?.subtype === 'interactive' ||
      config?.subtype === 'interactive' ||
      (task as any)?.interactive_type ||
      config?.interactive_type;
    if (isInteractive) {
      setTaskBeingEdited(task);
      setEditModalOpen(true);
    } else {
      setYamlEditorTaskId(task?.id ?? null);
    }
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {!isInteractivePage && (
        <NewTaskModal2
          open={modalOpen}
          onClose={handleClose}
          experimentId={experimentInfo?.id ?? ''}
          onTaskCreated={(taskId) => {
            setYamlEditorTaskId(taskId);
            handleClose();
          }}
        />
      )}
      {experimentInfo?.id && yamlEditorTaskId && (
        <TaskYamlEditorModal
          open={Boolean(yamlEditorTaskId)}
          onClose={() => setYamlEditorTaskId(null)}
          experimentId={experimentInfo.id}
          taskId={yamlEditorTaskId}
          onSaved={() => templatesMutate()}
        />
      )}
      {isInteractivePage && (
        <NewInteractiveTaskModal
          open={interactiveModalOpen}
          onClose={() => setInteractiveModalOpen(false)}
          onSubmit={handleSubmitInteractive}
          isSubmitting={isSubmitting}
          providers={providers}
          isProvidersLoading={providersIsLoading}
          importedTasks={tasks}
          onDeleteTask={handleDeleteTask}
          onQueueTask={handleQueue}
          onRefreshTasks={templatesMutate}
        />
      )}
      {taskBeingEdited &&
        ((taskBeingEdited as any).interactive_type ||
          SafeJSONParse((taskBeingEdited as any)?.config, {})
            ?.interactive_type) && (
          <EditInteractiveTaskModal
            open={editModalOpen}
            onClose={handleEditClose}
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
                const response = await fetchWithAuth(
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
                  message:
                    'Failed to update interactive task. Please try again.',
                });
              }
            }}
          />
        )}
      {taskBeingQueued && (
        <QueueTaskModal
          open={queueModalOpen}
          onClose={() => {
            setQueueModalOpen(false);
            setTaskBeingQueued(null);
          }}
          task={taskBeingQueued}
          onSubmit={handleQueueSubmit}
          isSubmitting={isSubmitting}
          experimentId={experimentInfo?.id ?? ''}
        />
      )}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
      >
        <Typography level="title-md">Tasks</Typography>
        <Button
          startDecorator={isInteractivePage ? <TerminalIcon /> : <PlusIcon />}
          onClick={handleOpen}
        >
          New
        </Button>
      </Stack>
      <Sheet
        variant="soft"
        sx={{
          px: 1,
          mt: 1,
          mb: 2,
          flex: 1,
          height: '100%',
          overflow: 'auto',
        }}
      >
        <TaskTemplateList
          tasksList={visibleTasks}
          onDeleteTask={handleDeleteTask}
          onQueueTask={handleQueue}
          onEditTask={handleEditTask}
          onExportTask={handleExportToTeamGallery}
          onViewFilesTask={(taskRow) =>
            setViewTaskFilesFromTask({
              id: taskRow.id,
              name: (taskRow as any).name ?? (taskRow as any).title ?? null,
            })
          }
          loading={templatesIsLoading}
        />
      </Sheet>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
        sx={{ mt: 1 }}
      >
        <Typography level="title-md">Jobs</Typography>
        <Stack direction="row" gap={1}>
          <Button
            size="sm"
            variant={isCompareSelectMode ? 'solid' : 'outlined'}
            onClick={() => {
              setIsCompareSelectMode((prev) => {
                const next = !prev;
                if (!next) {
                  setCompareEvalJobIds([]);
                  setCompareEvalModalOpen(false);
                }
                return next;
              });
            }}
          >
            {isCompareSelectMode ? 'Cancel' : 'Select'}
          </Button>
          {isCompareSelectMode && (
            <Button
              size="sm"
              variant="solid"
              disabled={compareEvalJobIds.length !== 2}
              onClick={() => {
                if (compareEvalJobIds.length === 2) {
                  setCompareEvalModalOpen(true);
                }
              }}
            >
              Compare selected evals
            </Button>
          )}
        </Stack>
      </Stack>
      <Sheet sx={{ px: 1, mt: 1, mb: 2, flex: 2, overflow: 'auto' }}>
        <JobsList
          jobs={jobsWithPlaceholders as any}
          launchProgressByJobId={launchProgressByJobId}
          onDeleteJob={handleDeleteJob}
          onViewOutput={(jobId) => {
            const jobIdStr =
              jobId === null || jobId === undefined ? '' : String(jobId);
            if (!jobIdStr || jobIdStr === '-1' || jobIdStr === 'NaN') return;
            setViewOutputFromJob(jobIdStr);
          }}
          onViewCheckpoints={(jobId) =>
            setViewCheckpointsFromJob(jobId && jobId !== 'NaN' ? jobId : null)
          }
          onViewArtifacts={(jobId) =>
            setViewArtifactsFromJob(jobId && jobId !== 'NaN' ? jobId : null)
          }
          onViewProfiling={(jobId) =>
            setViewProfilingFromJob(jobId && jobId !== 'NaN' ? jobId : null)
          }
          onViewEvalImages={(jobId) =>
            setViewEvalImagesFromJob(jobId && jobId !== 'NaN' ? jobId : null)
          }
          onViewEvalResults={(jobId) =>
            setViewEvalResultsFromJob(jobId && jobId !== 'NaN' ? jobId : null)
          }
          onViewGeneratedDataset={(jobId, datasetId) => {
            setPreviewDatasetModal({ open: true, datasetId });
          }}
          onViewJobDatasets={(jobId) =>
            setViewJobDatasetsFromJob(jobId && jobId !== 'NaN' ? jobId : null)
          }
          onViewJobModels={(jobId) =>
            setViewJobModelsFromJob(jobId && jobId !== 'NaN' ? jobId : null)
          }
          onViewFileBrowser={(jobId) => {
            if (jobId == null || jobId === '') return;
            setViewFileBrowserFromJob(String(jobId));
          }}
          onViewSweepOutput={(jobId) => {
            setViewOutputFromSweepJob(true);
            const jobIdStr =
              jobId === null || jobId === undefined ? '' : String(jobId);
            if (!jobIdStr || jobIdStr === '-1' || jobIdStr === 'NaN') return;
            setViewOutputFromJob(jobIdStr);
          }}
          onViewSweepResults={(jobId) => {
            setViewSweepResultsFromJob(jobId && jobId !== 'NaN' ? jobId : null);
          }}
          onViewInteractive={(jobId) =>
            setInteractiveJobForModal(jobId && jobId !== 'NaN' ? jobId : null)
          }
          onViewTrackio={(jobId) =>
            setTrackioJobIdForModal(jobId && jobId !== 'NaN' ? jobId : null)
          }
          loading={jobsIsLoading}
          selectMode={isCompareSelectMode}
          selectedJobIds={compareEvalJobIds.map((id) => String(id))}
          onToggleJobSelected={(jobId) => {
            setCompareEvalJobIds((prev) => {
              const id = jobId;
              if (!id || id === 'NaN') return prev;
              if (prev.includes(id)) {
                return prev.filter((existing) => existing !== id);
              }
              if (prev.length === 0) return [id];
              if (prev.length === 1) return [...prev, id];
              // If already two selected, replace the oldest with the new one
              return [prev[1], id];
            });
          }}
        />
      </Sheet>
      <ViewSweepResultsModal
        jobId={viewSweepResultsFromJob}
        setJobId={(jobId: string | null) => setViewSweepResultsFromJob(jobId)}
      />
      <ViewOutputModalStreaming
        jobId={viewOutputFromJob}
        setJobId={(jobId: string | null) => setViewOutputFromJob(jobId)}
        jobStatus={
          jobs?.find((j: any) => String(j.id) === viewOutputFromJob)?.status ||
          ''
        }
      />
      <ViewArtifactsModal
        open={viewArtifactsFromJob !== null}
        onClose={() => setViewArtifactsFromJob(null)}
        jobId={viewArtifactsFromJob}
      />
      <ViewProfilingModal
        open={viewProfilingFromJob !== null}
        onClose={() => setViewProfilingFromJob(null)}
        jobId={viewProfilingFromJob}
      />
      <ViewCheckpointsModal
        open={viewCheckpointsFromJob !== null}
        onClose={() => setViewCheckpointsFromJob(null)}
        jobId={viewCheckpointsFromJob}
      />
      <ViewEvalResultsModal
        open={viewEvalResultsFromJob !== null}
        onClose={() => setViewEvalResultsFromJob(null)}
        jobId={viewEvalResultsFromJob}
      />
      <CompareEvalResultsModal
        open={compareEvalModalOpen && compareEvalJobIds.length === 2}
        onClose={() => setCompareEvalModalOpen(false)}
        jobIds={compareEvalJobIds}
      />
      <InteractiveModal
        jobId={interactiveJobForModal}
        setJobId={(jobId: string | null) => setInteractiveJobForModal(jobId)}
      />
      <PreviewDatasetModal
        open={previewDatasetModal.open}
        setOpen={(open: boolean) =>
          setPreviewDatasetModal({ ...previewDatasetModal, open })
        }
        dataset_id={previewDatasetModal.datasetId}
        viewType="preview"
      />
      {viewJobDatasetsFromJob !== null && (
        <ViewJobDatasetsModal
          open
          onClose={() => setViewJobDatasetsFromJob(null)}
          jobId={viewJobDatasetsFromJob}
        />
      )}
      {viewJobModelsFromJob !== null && (
        <ViewJobModelsModal
          open
          onClose={() => setViewJobModelsFromJob(null)}
          jobId={viewJobModelsFromJob}
        />
      )}
      <FileBrowserModal
        mode="job"
        open={viewFileBrowserFromJob !== null}
        onClose={() => setViewFileBrowserFromJob(null)}
        jobId={viewFileBrowserFromJob ?? ''}
      />
      <FileBrowserModal
        mode="task"
        open={viewTaskFilesFromTask.id !== null}
        onClose={() => setViewTaskFilesFromTask({ id: null, name: null })}
        taskId={viewTaskFilesFromTask.id ?? ''}
        taskName={viewTaskFilesFromTask.name}
      />
      <TrackioModal
        jobId={trackioJobIdForModal}
        onClose={() => setTrackioJobIdForModal(null)}
      />
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
