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
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import DatasetPreviewEditImage from './DatasetPreviewEditImage';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';

export default function PreviewDatasetModal({
  dataset_id,
  open,
  setOpen,
  viewType = 'preview',
}) {
  const { data, error, isLoading } = useAPI(
    'datasets',
    ['info'],
    { dataset_id },
    { enabled: open },
  );

  const isImageDataset = data?.features?.image?._type === 'Image';

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
            {viewType === 'edit' ? (
              <DatasetPreviewEditImage datasetId={dataset_id} template="" />
            ) : (
              <DatasetTable datasetId={dataset_id} />
            )}
          </Box>
        </Sheet>
      </ModalDialog>
    </Modal>
  );
}
