import {
  Divider,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
  Box,
} from '@mui/joy';

import DatasetTable from './DatasetTable';

export default function PreviewDatasetModal({ dataset_id, open, setOpen }) {
  return (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false);
      }}
    >
      <ModalDialog>
        <ModalClose />
        <Typography level="h4">
          Preview <b>{dataset_id}</b>
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Sheet
          sx={{
            display: 'flex',
            flexDirection: 'column',
            width: '80vw',
            height: '80vh',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <DatasetTable datasetId={dataset_id} />
          </Box>
        </Sheet>
      </ModalDialog>
    </Modal>
  );
}
