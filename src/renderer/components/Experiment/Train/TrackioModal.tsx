import { useEffect, useState } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  CircularProgress,
  Box,
  Typography,
  IconButton,
  Button,
} from '@mui/joy';
import { ExternalLinkIcon, RotateCcwIcon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

interface TrackioModalProps {
  jobId: number | null;
  onClose: () => void;
}

export default function TrackioModal({ jobId, onClose }: TrackioModalProps) {
  const [iframeReady, setIframeReady] = useState(false);
  const [trackioUrl, setTrackioUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const startTrackio = async () => {
      if (jobId === null) return;
      setIframeReady(false);
      setError(null);

      try {
        const response = await chatAPI.authenticatedFetch(
          `${chatAPI.API_URL()}trackio/start?job_id=${jobId}`,
        );
        if (!response.ok) {
          const txt = await response.text();
          setError(
            txt || 'Failed to start Trackio dashboard for this job. Please try again.',
          );
          return;
        }
        const data = (await response.json()) as { url?: string };
        if (!cancelled && data.url) {
          setTrackioUrl(data.url);
          setIframeReady(true);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error starting Trackio dashboard', e);
        if (!cancelled) {
          setError('Failed to start Trackio dashboard. Check server logs for details.');
        }
      }
    };

    if (jobId !== null) {
      startTrackio().catch((e) => {
        // eslint-disable-next-line no-console
        console.error(e);
      });
    }

    return () => {
      cancelled = true;
      if (jobId !== null) {
        // Best-effort attempt to stop the Trackio server for this job
        fetcher(`${chatAPI.API_URL()}trackio/stop?job_id=${jobId}`).catch(() => {});
      }
    };
  }, [jobId]);

  const handleClose = () => {
    onClose();
  };

  const handleOpenInBrowser = () => {
    if (trackioUrl) {
      window.open(trackioUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleRetry = () => {
    // Reset state to trigger useEffect re-run
    if (jobId !== null) {
      setIframeReady(false);
      setError(null);
    }
  };

  return (
    <Modal open={jobId !== null} onClose={handleClose}>
      <ModalDialog
        sx={{
          height: '80vh',
          width: '80vw',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography level="body-sm" sx={{ flex: 1, overflow: 'hidden' }}>
            {trackioUrl || 'Trackio dashboard starting...'}
          </Typography>
          {trackioUrl && (
            <IconButton
              size="sm"
              onClick={handleOpenInBrowser}
              color="neutral"
              variant="outlined"
              title="Open Trackio dashboard in browser"
            >
              <ExternalLinkIcon size={16} />
            </IconButton>
          )}
          {error && (
            <IconButton
              size="sm"
              onClick={handleRetry}
              color="warning"
              variant="outlined"
              title="Retry starting Trackio dashboard"
            >
              <RotateCcwIcon size={16} />
            </IconButton>
          )}
        </Box>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <Box sx={{ textAlign: 'center' }}>
              <Typography level="body-md" color="danger">
                {error}
              </Typography>
              <Button
                size="sm"
                variant="outlined"
                onClick={handleRetry}
                sx={{ mt: 1 }}
              >
                Retry
              </Button>
            </Box>
          ) : iframeReady && trackioUrl ? (
            <iframe
              id="trackio-dashboard"
              src={trackioUrl}
              title="Trackio dashboard"
              style={{
                border: '1px solid black',
                display: 'flex',
                flex: 1,
                height: '100%',
                width: '100%',
              }}
            />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress />
              <Typography level="body-sm">Waiting for Trackio dashboard to start...</Typography>
            </Box>
          )}
        </Box>
      </ModalDialog>
    </Modal>
  );
}

