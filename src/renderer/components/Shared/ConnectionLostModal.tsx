import {
  DialogContent,
  DialogTitle,
  Modal,
  ModalDialog,
  Typography,
  CircularProgress,
  Box,
} from '@mui/joy';
import React, { useState, useEffect } from 'react';
import { apiHealthz } from 'renderer/lib/transformerlab-api-sdk';
import { AlertCircle } from 'lucide-react';

interface ConnectionLostModalProps {
  connection: string;
}

export default function ConnectionLostModal({
  connection,
}: ConnectionLostModalProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkCount, setCheckCount] = useState(0);

  // Poll apiHealthz every 5 seconds to check if connection is restored
  useEffect(() => {
    if (!connection || connection === '') {
      return;
    }

    const checkConnection = async () => {
      setIsChecking(true);
      try {
        const healthz = await apiHealthz();
        if (healthz !== null) {
          // Connection restored - the parent component will detect this
          // and close the modal
          setIsChecking(false);
          return;
        }
      } catch (error) {
        // Connection still lost
        console.log('Connection check failed:', error);
      } finally {
        setIsChecking(false);
        setCheckCount((prev) => prev + 1);
      }
    };

    // Check immediately
    checkConnection();

    // Then check every 5 seconds
    const interval = setInterval(() => {
      checkConnection();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [connection]);

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
                : `Retrying in 5 seconds... (Attempt ${checkCount + 1})`}
            </Typography>
          </Box>
          <Typography level="body-sm" sx={{ mt: 2, opacity: 0.7 }}>
            This modal will automatically close when the connection is restored.
          </Typography>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
