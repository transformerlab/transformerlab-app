import { useState } from 'react';
import {
  Box,
  Button,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from '@mui/joy';
import OrchestratorLogsTerminal from './OrchestratorLogsTerminal';

interface OrchestratorLogsModalProps {
  requestId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function OrchestratorLogsModal({
  requestId,
  open,
  onClose,
}: OrchestratorLogsModalProps) {
  if (!requestId) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '80vw', height: '80vh' }}>
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Orchestrator Logs
        </Typography>
        <Typography level="body-sm" sx={{ mb: 2, color: 'text.secondary' }}>
          Request ID: {requestId}
        </Typography>

        <Box
          sx={{
            height: '100%',
            overflow: 'hidden',
            border: '10px solid #444',
            padding: '0rem 0 0 1rem',
            backgroundColor: '#000',
            width: '100%',
          }}
        >
          <OrchestratorLogsTerminal requestId={requestId} />
        </Box>
      </ModalDialog>
    </Modal>
  );
}
