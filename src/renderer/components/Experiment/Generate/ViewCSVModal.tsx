import React, { useEffect, useState } from 'react';
import { Modal, Box, Typography, IconButton, ModalClose, ModalDialog } from '@mui/joy';

const ViewCSVModal = ({ open, onClose, jobId, fetchCSV }) => {
  const [csvText, setCsvText] = useState('');

  useEffect(() => {
    if (open && jobId) {
      fetchCSV(jobId).then(data => {
        setCsvText(data);
      });
    }
  }, [open, jobId, fetchCSV]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '80vw', height: '80vh' }}>
        <ModalClose />
      <Box
          sx={{
            height: '100%',
            overflow: 'hidden',
            border: '10px solid #444',
            padding: '0rem 0 0 1rem',
            backgroundColor: '#fff',
            width: '100%',
          }}
        >
        <Typography level="h4" mb={2}>
          Additional Output from Job: {jobId}
        </Typography>
        <pre>{csvText}</pre>
      </Box>
      </ModalDialog>
    </Modal>
  );
};

export default ViewCSVModal;
