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
import { apiHealthz } from 'renderer/lib/transformerlab-api-sdk';
import { AlertCircle } from 'lucide-react';

interface ConnectionLostModalProps {
  connection: string;
  setConnection: (conn: string) => void;
}

export default function ConnectionLostModal({
  connection,
  setConnection,
}: ConnectionLostModalProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const checkCountRef = useRef(0);
  const MAX_ATTEMPTS = 16;

  // Poll apiHealthz every 5 seconds to check if connection is restored
  useEffect(() => {
    if (!connection || connection === '') {
      return;
    }

    // Reset check count when connection changes
    checkCountRef.current = 0;
    setCheckCount(0);

    let interval: NodeJS.Timeout | null = null;

    const checkConnection = async () => {
      // Stop if we've reached max attempts
      if (checkCountRef.current >= MAX_ATTEMPTS) {
        if (interval) {
          clearInterval(interval);
        }
        return;
      }

      setIsChecking(true);
      try {
        const healthz = await apiHealthz();
        if (healthz !== null) {
          // Connection restored - the parent component will detect this
          // and close the modal
          setIsChecking(false);
          if (interval) {
            clearInterval(interval);
          }
          return;
        }
      } catch (error) {
        // Connection still lost
        console.log('Connection check failed:', error);
      } finally {
        setIsChecking(false);
        checkCountRef.current += 1;
        const newCount = checkCountRef.current;
        setCheckCount(newCount);

        // After MAX_ATTEMPTS, give up and clear the connection
        if (newCount >= MAX_ATTEMPTS) {
          console.log(
            `Connection check failed after ${MAX_ATTEMPTS} attempts. Clearing connection.`,
          );
          // Clear the API URL
          if ((window as any).TransformerLab) {
            (window as any).TransformerLab.API_URL = null;
          }
          setConnection('');
          if (interval) {
            clearInterval(interval);
          }
        }
      }
    };

    // Check immediately
    checkConnection();

    // Then check every 5 seconds
    interval = setInterval(() => {
      checkConnection();
    }, 5000);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [connection, setConnection]);

  return (
    <Modal open={true} hideBackdrop={false}>
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
            <Typography level="body-sm">
              {isChecking
                ? 'Checking connection...'
                : checkCount >= MAX_ATTEMPTS
                  ? `Failed after ${MAX_ATTEMPTS} attempts. Closing...`
                  : `Retrying in 5 seconds... (Attempt ${checkCount + 1}/${MAX_ATTEMPTS})`}
            </Typography>
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
