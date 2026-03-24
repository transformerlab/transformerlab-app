import React from 'react';
import { Box, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';
import ProfilingReport from './ProfilingReport';

interface ViewProfilingModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string | null;
}

export default function ViewProfilingModal({
  open,
  onClose,
  jobId,
}: ViewProfilingModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: '90vw',
          maxWidth: 640,
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Profiling – Job {jobId}
        </Typography>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {jobId && <ProfilingReport jobId={jobId} />}
        </Box>
      </ModalDialog>
    </Modal>
  );
}
