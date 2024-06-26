/* eslint-disable camelcase */
import {
  Divider,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
} from '@mui/joy';

import DatasetTable from './DatasetTable';

const fetcher = (url) =>
  fetch(url)
    .then((res) => res.json())
    .then((data) => data);

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
            gap: 2,
            overflowY: 'hidden',
            width: '80vw',
            height: '80vh',
            justifyContent: 'space-between',
          }}
        >
          <DatasetTable datasetId={dataset_id} />
        </Sheet>
      </ModalDialog>
    </Modal>
  );
}
