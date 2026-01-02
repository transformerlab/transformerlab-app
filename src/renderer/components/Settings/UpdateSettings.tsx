import * as React from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Sheet,
  Switch,
  Typography,
} from '@mui/joy';
import { RefreshCwIcon, DownloadIcon } from 'lucide-react';
import {
  authenticatedFetch,
  Endpoints,
  apiHealthz,
} from 'renderer/lib/transformerlab-api-sdk';
import { useAuth, useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { useNotification } from '../Shared/NotificationSystem';
import UpdateLogsTerminal from './UpdateLogsTerminal';

export default function UpdateSettings() {
  const { addNotification } = useNotification();

  const [isUpdating, setIsUpdating] = React.useState(false);
  const [updateStatus, setUpdateStatus] = React.useState<string | null>(null);
  const [localUpdateInProgress, setLocalUpdateInProgress] =
    React.useState(false);
  const [hasConfirmedInProgress, setHasConfirmedInProgress] =
    React.useState(false);

  const { data: settings, isError: settingsError } = useSWR(
    Endpoints.Updates.Settings(),
  );
  const {
    data: versionInfo,
    isError: versionError,
    mutate: mutateVersion,
  } = useSWR(Endpoints.Updates.Version());
  const {
    data: updateCheck,
    isError: updateCheckError,
    mutate: mutateUpdateCheck,
  } = useSWR(Endpoints.Updates.Check());
  const {
    data: updateStatusData,
    isError: updateStatusError,
    mutate: mutateUpdateStatus,
  } = useSWR(Endpoints.Updates.Status());

  // Poll status when update is in progress
  React.useEffect(() => {
    if (updateStatusData?.in_progress || localUpdateInProgress) {
      const statusInterval = setInterval(() => {
        mutateUpdateStatus();
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(statusInterval);
    }
  }, [
    updateStatusData?.in_progress,
    localUpdateInProgress,
    mutateUpdateStatus,
  ]);

  // Track previous in_progress state to detect transitions
  const prevInProgressRef = React.useRef<boolean | undefined>(undefined);

  // Update local state when API confirms update status
  React.useEffect(() => {
    if (updateStatusData) {
      const wasInProgress = prevInProgressRef.current;
      const isInProgress = updateStatusData.in_progress;

      // Track if we've confirmed the update actually started (from API)
      if (isInProgress && !hasConfirmedInProgress) {
        setHasConfirmedInProgress(true);
        setLocalUpdateInProgress(true);
      } else if (!isInProgress) {
        setLocalUpdateInProgress(false);
      }

      // Only show completion notification if we had confirmed it was in progress
      // and now it's transitioning from in progress to not in progress
      if (hasConfirmedInProgress && wasInProgress === true && !isInProgress) {
        setIsUpdating(false);
        setHasConfirmedInProgress(false);
        // Refresh version and update check to show new version
        mutateVersion();
        mutateUpdateCheck();
        // Show notification to restart API
        addNotification({
          message:
            'Update completed successfully! Please restart the API server for changes to take effect.',
          type: 'success',
        });
      } else if (!isInProgress) {
        // Reset button state if update is not in progress
        // This handles both cases: confirmed updates that completed, and unconfirmed updates
        if (hasConfirmedInProgress || isUpdating) {
          setIsUpdating(false);
          if (hasConfirmedInProgress) {
            setHasConfirmedInProgress(false);
          }
        }
      }

      // Update the ref for next comparison
      prevInProgressRef.current = isInProgress;
    }
  }, [
    updateStatusData,
    hasConfirmedInProgress,
    mutateVersion,
    mutateUpdateCheck,
    addNotification,
  ]);

  // Check if user is not authorized (403 error means not owner)
  // useSWRWithAuth returns error with status property
  const isNotAuthorized =
    (settingsError as any)?.status === 403 ||
    (versionError as any)?.status === 403 ||
    (updateCheckError as any)?.status === 403 ||
    (updateStatusError as any)?.status === 403;

  // Check if in S3 mode from healthz endpoint
  const [isS3Mode, setIsS3Mode] = React.useState(false);

  React.useEffect(() => {
    const checkMode = async () => {
      try {
        const healthzData = await apiHealthz();
        setIsS3Mode(healthzData?.mode === 's3');
      } catch (error) {
        console.error('Error checking mode:', error);
      }
    };
    checkMode();
  }, []);

  const handleCheckUpdates = async () => {
    try {
      await mutateUpdateCheck();
      localStorage.setItem('tlab_last_update_check', Date.now().toString());
      if (updateCheck?.latest_version) {
        localStorage.setItem('tlab_latest_version', updateCheck.latest_version);
      }
      if (updateCheck?.available !== undefined) {
        localStorage.setItem(
          'tlab_update_available',
          updateCheck.available.toString(),
        );
      }
      addNotification({
        message: 'Update check completed',
        type: 'success',
      });
    } catch (error) {
      console.error('Error checking for updates:', error);
      addNotification({
        message: 'Failed to check for updates',
        type: 'danger',
      });
    }
  };

  const handleTriggerUpdate = async () => {
    setIsUpdating(true);
    setUpdateStatus(null);
    setLocalUpdateInProgress(true); // Show terminal immediately
    setHasConfirmedInProgress(false); // Reset confirmation flag

    try {
      const response = await authenticatedFetch(Endpoints.Updates.Trigger(), {
        method: 'POST',
      });

      if (response.status === 'started') {
        setUpdateStatus('started');
        addNotification({
          message: 'Update started in background',
          type: 'success',
        });
        // Start polling for status - this will confirm when update actually starts
        mutateUpdateStatus();
      }
    } catch (error: any) {
      console.error('Error triggering update:', error);
      setLocalUpdateInProgress(false); // Hide terminal on error
      setIsUpdating(false);
      setHasConfirmedInProgress(false); // Reset on error
      if (error.response?.detail) {
        addNotification({
          message: error.response.detail,
          type: 'danger',
        });
      } else {
        addNotification({
          message: 'Failed to start update',
          type: 'danger',
        });
      }
    }
    // Note: Don't set isUpdating to false here - keep it true until update completes
  };

  // Show error message if user is not authorized (not an owner)
  if (isNotAuthorized) {
    return (
      <Sheet sx={{ p: 2 }}>
        <Alert color="warning">
          Only team owners can manage update settings.
        </Alert>
      </Sheet>
    );
  }

  // Hide updates in S3 mode
  if (isS3Mode) {
    return (
      <Sheet sx={{ p: 2 }}>
        <Alert color="info">
          Updates are not available when using S3/remote storage.
        </Alert>
      </Sheet>
    );
  }

  const updateAvailable = updateCheck?.available || false;
  const updateInProgress =
    updateStatusData?.in_progress || localUpdateInProgress;
  const updateComplete =
    updateStatusData?.status === 'complete' || updateStatus === 'complete';

  return (
    <Sheet sx={{ p: 2 }}>
      <Typography level="h3" mb={2}>
        Update Settings
      </Typography>

      <Typography level="title-md" mb={1}>
        Version Information
      </Typography>
      <Typography level="body-sm" mb={2}>
        Current Version: <strong>{versionInfo?.version || 'unknown'}</strong>
      </Typography>

      {updateCheck && (
        <Typography level="body-sm" mb={2}>
          Latest Version:{' '}
          <strong>{updateCheck.latest_version || 'unknown'}</strong>
        </Typography>
      )}

      {updateAvailable && (
        <Alert color="info" sx={{ mb: 2 }}>
          Update available: {updateCheck?.latest_version}. Click "Update Now" to
          install.
        </Alert>
      )}

      {updateInProgress && (
        <Alert color="warning" sx={{ mb: 2 }}>
          Update in progress... This may take a few minutes.
        </Alert>
      )}

      <Button
        onClick={handleCheckUpdates}
        startDecorator={<RefreshCwIcon />}
        variant="outlined"
        sx={{ mr: 2 }}
      >
        Check for Updates
      </Button>

      <Button
        onClick={handleTriggerUpdate}
        startDecorator={<DownloadIcon />}
        disabled={isUpdating || updateInProgress || !updateAvailable}
        variant="solid"
        color="primary"
        loading={isUpdating || updateInProgress}
      >
        {isUpdating || updateInProgress ? 'Updating...' : 'Update Now'}
      </Button>

      {updateInProgress && (
        <Sheet sx={{ mt: 2 }}>
          <Typography level="title-sm" mb={1}>
            Update Logs
          </Typography>
          <UpdateLogsTerminal isActive={updateInProgress} />
        </Sheet>
      )}
    </Sheet>
  );
}
