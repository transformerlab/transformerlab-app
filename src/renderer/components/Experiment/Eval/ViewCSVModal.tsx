import React, { useEffect, useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  IconButton,
  ModalClose,
  ModalDialog,
} from '@mui/joy';

const ViewCSVModal = ({ open, onClose, jobId, fetchCSV }) => {
  const [csvText, setCsvText] = useState('');

  useEffect(() => {
    if (open && jobId) {
      fetchCSV(jobId).then((data) => {
        setCsvText(data);
      });
    }
  }, [open, jobId, fetchCSV]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', height: '90vh' }}>
        <ModalClose />
        <Typography level="h4" mb={2}>
          Additional Output from Job: {jobId}
        </Typography>
        <Box>
          <pre>{csvText}</pre>
        </Box>
      </ModalDialog>
    </Modal>
  );
};

export default ViewCSVModal;
