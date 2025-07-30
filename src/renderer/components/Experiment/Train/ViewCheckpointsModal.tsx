import React, { useState } from 'react';
import {
  Modal,
  ModalDialog,
  Typography,
  Button,
  Box,
  ModalClose,
} from '@mui/joy';

export default function ViewCheckpointsModal({ open, onClose, jobId }) {
  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog>
        <ModalClose />

        <Typography level="h4" component="h2">
          Modal Title
        </Typography>
        <Typography level="body-md">
          Modal content goes here for job {jobId}
        </Typography>
      </ModalDialog>
    </Modal>
  );
}
