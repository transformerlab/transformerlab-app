import React, { useState, useEffect, useRef } from 'react';
import {
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalDialog,
  Typography,
  Box,
} from '@mui/joy';

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const LAST_CHECK_KEY = 'cloudUpdateLastCheck';
const UPDATE_DOWNLOADED_KEY = 'cloudUpdateDownloaded';
const DOWNLOADED_VERSION_KEY = 'cloudUpdateDownloadedVersion';

export default function CloudUpdateModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>('Looking for updates');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [streamingOutput, setStreamingOutput] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamComplete, setStreamComplete] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Only run in cloud mode
  const isCloudMode = (window as any).platform?.appmode === 'cloud';

  useEffect(() => {
    if (!isCloudMode) {
      return;
    }

    // Set up message listener (same pattern as AutoUpdateModal)
    const messageHandler = (_event: any, msg: string) => {
      setMessage(msg);

      if (msg === 'Update not available.') {
        setOpen(false);
      }

      if (msg === 'Update available') {
        setUpdateAvailable(true);
        setOpen(true);
        // Get versions for display
        const platformVersion = (window as any).platform?.version || '0.0.0';
        setCurrentVersion(platformVersion);
        // Fetch latest version from GitHub for display
        fetch(
          'https://api.github.com/repos/transformerlab/transformerlab-app/releases/latest',
        )
          .then((res) => res.json())
          .then((release) => {
            setLatestVersion(release.tag_name);
          })
          .catch(console.error);
      }

      if (msg === 'Update downloaded') {
        setDownloaded(true);
        setUpdateAvailable(false);
        // Keep modal open to show instructions
      }

      if (msg === 'Update error') {
        setTimeout(() => {
          setOpen(false);
        }, 2000);
      }
    };

    window.autoUpdater.onMessage(messageHandler);

    const checkForUpdates = async () => {
      // Get last check time from localStorage
      let lastCheckTime: number | null = null;
      if ((window as any).storage) {
        lastCheckTime = await (window as any).storage.get(LAST_CHECK_KEY);
      } else {
        const stored = localStorage.getItem(LAST_CHECK_KEY);
        lastCheckTime = stored ? parseInt(stored, 10) : null;
      }

      // Check if we need to check for updates (every 12 hours)
      const now = Date.now();
      if (lastCheckTime && now - lastCheckTime < CHECK_INTERVAL_MS) {
        return;
      }

      // Check if update was already downloaded
      let updateDownloaded: boolean = false;
      let downloadedVersion: string | null = null;
      if ((window as any).storage) {
        updateDownloaded =
          (await (window as any).storage.get(UPDATE_DOWNLOADED_KEY)) || false;
        downloadedVersion =
          (await (window as any).storage.get(DOWNLOADED_VERSION_KEY)) || null;
      } else {
        updateDownloaded =
          localStorage.getItem(UPDATE_DOWNLOADED_KEY) === 'true';
        downloadedVersion = localStorage.getItem(DOWNLOADED_VERSION_KEY);
      }

      // If update was downloaded, show instructions
      if (updateDownloaded && downloadedVersion) {
        const platformVersion = (window as any).platform?.version || '0.0.0';
        if (downloadedVersion !== platformVersion) {
          setDownloaded(true);
          setOpen(true);
          setLatestVersion(downloadedVersion);
          setCurrentVersion(platformVersion);
          return;
        }
      }

      // Save last check time
      if ((window as any).storage) {
        await (window as any).storage.set(LAST_CHECK_KEY, now);
      } else {
        localStorage.setItem(LAST_CHECK_KEY, now.toString());
      }

      // Request update check (uses the same interface as AutoUpdateModal)
      window.autoUpdater.requestUpdate();
    };

    // Initial check
    checkForUpdates();

    // Set up interval to check every 12 hours
    const interval = setInterval(checkForUpdates, CHECK_INTERVAL_MS);

    return () => {
      window.autoUpdater.removeAllListeners();
      clearInterval(interval);
    };
  }, [isCloudMode]);

  const handleDownload = async () => {
    setIsStreaming(true);
    setStreamComplete(false);
    setStreamingOutput([]);
    setOpen(true);

    try {
      const apiUrl = (window as any).TransformerLab?.API_URL || '/api/';
      const apiBase = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;

      // Get auth token and team from localStorage
      const accessToken = localStorage.getItem('access_token');
      let currentTeam: { id: string; name: string } | null = null;
      try {
        const teamStr = localStorage.getItem('current_team');
        if (teamStr) {
          currentTeam = JSON.parse(teamStr);
        }
      } catch {
        currentTeam = null;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      if (currentTeam) {
        headers['X-Team-Id'] = currentTeam.id;
        headers['X-Team-Name'] = currentTeam.name;
      }

      const response = await fetch(`${apiBase}server/update`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Update failed with status ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.line) {
                setStreamingOutput((prev) => [...prev, data.line]);
              }
              if (data.success) {
                setStreamComplete(true);
                setIsStreaming(false);
                // Mark update as downloaded
                if ((window as any).storage) {
                  await (window as any).storage.set(
                    UPDATE_DOWNLOADED_KEY,
                    true,
                  );
                  await (window as any).storage.set(
                    DOWNLOADED_VERSION_KEY,
                    latestVersion || '',
                  );
                } else {
                  localStorage.setItem(UPDATE_DOWNLOADED_KEY, 'true');
                  if (latestVersion) {
                    localStorage.setItem(DOWNLOADED_VERSION_KEY, latestVersion);
                  }
                }
                setDownloaded(true);
                setUpdateAvailable(false);
              }
              if (data.error) {
                setStreamingOutput((prev) => [
                  ...prev,
                  `\nError: ${data.error}\n`,
                ]);
                setIsStreaming(false);
                setStreamComplete(true);
              }
            } catch (e) {
              // Ignore JSON parse errors for malformed chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Error downloading update:', error);
      setStreamingOutput((prev) => [
        ...prev,
        `\nError: ${error instanceof Error ? error.message : 'Failed to download update'}\n`,
      ]);
      setIsStreaming(false);
      setStreamComplete(true);
    }
  };

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [streamingOutput]);

  const handleClose = () => {
    setOpen(false);
  };

  if (!isCloudMode) {
    return null;
  }

  if (downloaded || streamComplete) {
    return (
      <Modal open={open} onClose={handleClose}>
        <ModalDialog
          variant="soft"
          sx={{
            minWidth: '40vw',
            maxWidth: '60vw',
          }}
          color="success"
        >
          <DialogTitle level="h2">✅ Update Complete</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Typography level="body-md" sx={{ mb: 2 }}>
              The update has been installed successfully. Please restart your
              API:
            </Typography>
            <Box
              sx={{
                backgroundColor: 'var(--joy-palette-background-surface)',
                p: 2,
                borderRadius: 'sm',
                mb: 2,
              }}
            >
              <Typography
                level="body-sm"
                fontFamily="monospace"
                sx={{
                  display: 'block',
                  p: 1,
                  backgroundColor: 'var(--joy-palette-background-level2)',
                  borderRadius: 'sm',
                }}
              >
                ~/.transformerlab/src/run.sh
              </Typography>
            </Box>
          </DialogContent>
          <Button
            sx={{ width: 'fit-content', alignSelf: 'flex-end', mt: 1 }}
            onClick={handleClose}
          >
            Got it
          </Button>
        </ModalDialog>
      </Modal>
    );
  }

  if (isStreaming) {
    return (
      <Modal open={open} onClose={() => {}}>
        <ModalDialog
          variant="soft"
          sx={{
            minWidth: '50vw',
            maxWidth: '70vw',
            maxHeight: '80vh',
          }}
          color="primary"
        >
          <DialogTitle level="h2">🔄 Downloading Update</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Box
              ref={outputRef}
              component="pre"
              sx={{
                backgroundColor: '#000',
                color: '#0f0',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                p: 2,
                borderRadius: 'sm',
                maxHeight: '400px',
                overflowY: 'auto',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
              }}
            >
              {streamingOutput.length === 0
                ? 'Starting download...'
                : streamingOutput.join('')}
            </Box>
          </DialogContent>
        </ModalDialog>
      </Modal>
    );
  }

  if (!updateAvailable) {
    return null;
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog
        variant="soft"
        sx={{
          minWidth: '30vw',
          maxWidth: '50vw',
        }}
        color="primary"
      >
        <DialogTitle level="h2">🔄 Update Available</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography level="body-md" sx={{ mb: 2 }}>
            A new version of Transformer Lab is available!
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Typography level="body-sm">
              Current version:{' '}
              <Typography
                component="span"
                fontFamily="monospace"
                sx={{ fontWeight: 'bold' }}
              >
                {currentVersion}
              </Typography>
            </Typography>
            <Typography level="body-sm">
              Latest version:{' '}
              <Typography
                component="span"
                fontFamily="monospace"
                sx={{ fontWeight: 'bold' }}
              >
                {latestVersion}
              </Typography>
            </Typography>
          </Box>
          <Typography level="body-sm" sx={{ opacity: 0.8 }}>
            Would you like to download the update?
          </Typography>
        </DialogContent>
        <Box
          sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}
        >
          <Button variant="outlined" onClick={handleClose}>
            Later
          </Button>
          <Button onClick={handleDownload}>
            {message === 'Downloading update...'
              ? 'Downloading...'
              : 'Download'}
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
