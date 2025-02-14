import React from 'react';
import { Modal, ModalDialog, ModalClose, Box, Typography } from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface ViewPlotModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
}

const ViewPlotModal: React.FC<ViewPlotModalProps> = ({ open, onClose, jobId }) => {
  const [plotData, setPlotData] = React.useState<string | null>(null);

  const fetchPlot = async (jobId: string) => {
    const response = await fetch(chatAPI.Endpoints.Experiment.GetPlotJSON(jobId));
    const jsonResponse = await response.json();
    return JSON.stringify(jsonResponse);
  };

  React.useEffect(() => {
    if (jobId) {
      fetchPlot(jobId).then(setPlotData);
    }
  }, [jobId]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', height: '90vh', pt: 5, position: 'relative' }}>
        <ModalClose />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography level="h4" mb={2}>
            Figure Preview
          </Typography>
          <Box
            sx={{
              maxWidth: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              borderRadius: '8px',
              boxShadow: 1,
              p: 2,
            }}
          >
            {plotData}
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
};

export default ViewPlotModal;
