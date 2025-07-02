/* eslint-disable camelcase */

import {
  Button,
  Divider,
  Table,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
  CircularProgress,
  DialogContent,
  DialogTitle,
  Box,
} from '@mui/joy';

import { useAPI } from '../../lib/transformerlab-api-sdk';

export default function DatasetInfoModal({ dataset_id, open, setOpen }) {
  const { data, error, isLoading, mutate } = useAPI('datasets', ['info'], {
    datasetId: dataset_id,
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false);
      }}
    >
      <ModalDialog>
        <ModalClose />
        <Box //This needs to be in a box otherwise close does not work as expected.
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflowY: 'hidden',
            width: '50vw',
            height: '80vh',
            justifyContent: 'center',
          }}
        >
          <DialogTitle>Dataset Info</DialogTitle>
          <DialogContent>
            {isLoading && <CircularProgress />}
            {data && ( //Style keeps the data from overflowing, makes it fit in the box
              <pre style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </DialogContent>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
