import { Modal, ModalDialog, ModalClose, Box, Typography } from '@mui/joy';
import Chart from './Chart';

function parseJSON(data) {
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export default function ViewPlotModal({
  open,
  onClose,
  data,
  jobId,
  compareChart = false,
}) {
  if (!jobId) {
    return <></>;
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ width: '90vw', height: '90vh', pt: 5, position: 'relative' }}
      >
        <ModalClose />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <Box
            sx={{
              width: '100%',
              height: '100%',
              maxWidth: '800px',
              maxHeight: '80vh',
              overflowY: 'auto',
              borderRadius: '8px',
              boxShadow: 1,
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Chart metrics={parseJSON(data)} compareChart={compareChart} />
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
