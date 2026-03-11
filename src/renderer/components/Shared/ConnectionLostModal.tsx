import {
  DialogContent,
  DialogTitle,
  Modal,
  ModalDialog,
  Typography,
  CircularProgress,
  Box,
} from '@mui/joy';
import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

const HEALTHZ_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 16;
const RETRY_INTERVAL_MS = 5000;

interface ConnectionLostModalProps {
  connection: string;
  setConnection: (conn: string) => void;
}

/** Direct fetch to healthz with timeout; no auth/context to avoid hanging. */
async function fetchHealthz(baseUrl: string): Promise<unknown | null> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = `${base}healthz`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTHZ_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      credentials: 'include',
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return res.json();
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export default function ConnectionLostModal({
  connection,
  setConnection,
}: ConnectionLostModalProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const checkCountRef = useRef(0);

  useEffect(() => {
    if (!connection || connection === '') return () => {};

    checkCountRef.current = 0;
    setCheckCount(0);
    let interval: ReturnType<typeof setInterval> | null = null;

    const checkConnection = async () => {
      if (checkCountRef.current >= MAX_ATTEMPTS) {
        if (interval) clearInterval(interval);
        return;
      }
      setIsChecking(true);
      try {
        const healthz = await fetchHealthz(connection);
        if (healthz !== null) {
          setIsChecking(false);
          if (interval) clearInterval(interval);
          return;
        }
      } catch {
        // ignore
      } finally {
        setIsChecking(false);
        checkCountRef.current += 1;
        const n = checkCountRef.current;
        setCheckCount(n);
        if (n >= MAX_ATTEMPTS) {
          if (typeof window !== 'undefined' && (window as any).TransformerLab) {
            (window as any).TransformerLab.API_URL = null;
          }
          setConnection('');
          if (interval) clearInterval(interval);
        }
      }
    };

    checkConnection();
    interval = setInterval(checkConnection, RETRY_INTERVAL_MS);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connection, setConnection]);

  let statusText = 'Retrying in 5 seconds...';
  if (isChecking) statusText = 'Checking connection...';
  else if (checkCount >= MAX_ATTEMPTS) {
    statusText = `Failed after ${MAX_ATTEMPTS} attempts. Closing...`;
  } else {
    statusText = `Retrying in 5 seconds... (Attempt ${checkCount + 1}/${MAX_ATTEMPTS})`;
  }

  return (
    <Modal open hideBackdrop={false}>
      <ModalDialog
        variant="soft"
        color="danger"
        sx={{
          minWidth: '400px',
          maxWidth: '600px',
          textAlign: 'center',
        }}
      >
        <DialogTitle level="h2">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AlertCircle size={32} />
            <Typography level="h2">Connection Lost</Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography level="body-lg" sx={{ mb: 2 }}>
            Lost connection to the API server at:
          </Typography>
          <Typography
            level="body-md"
            sx={{
              mb: 3,
              fontFamily: 'monospace',
              backgroundColor: 'var(--joy-palette-background-surface)',
              p: 1,
              borderRadius: 'sm',
            }}
          >
            {connection}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            {isChecking && <CircularProgress size="sm" />}
            <Typography level="body-sm">{statusText}</Typography>
          </Box>
          <Typography level="body-sm" sx={{ mt: 2, opacity: 0.7 }}>
            {checkCount >= MAX_ATTEMPTS
              ? 'Connection will be cleared. Please reconnect manually.'
              : 'This modal will automatically close when the connection is restored.'}
          </Typography>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
