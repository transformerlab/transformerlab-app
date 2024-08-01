import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import {
  Box,
  Modal,
  ModalClose,
  ModalDialog,
  Skeleton,
  Stack,
  Typography,
} from '@mui/joy';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TrainingJobDetailsModal({ jobId, setJobId }) {
  const {
    data: modelData,
    error: modelError,
    isLoading: isLoading,
  } = useSWR(
    modelId == null
      ? null
      : chatAPI.Endpoints.Models.ModelDetailsFromGallery(modelId),
    fetcher
  );

  return (
    <Modal open={modelId != null} onClose={() => setModelId(null)}>
      <ModalDialog sx={{ gap: 0 }}>
        <ModalClose />
        <Stack direction="row" alignItems="flex-start">
          {modelData?.logo ? (
            <img
              src={modelData?.logo}
              alt=""
              style={{
                margin: '0px 40px 0px 0px',
                width: '200px',
                objectFit: 'contain',
                borderRadius: '20px',
              }}
              width="200"
            />
          ) : (
            <Skeleton variant="rectangular" width={200} height={200} />
          )}
          <div>
            <Typography level="h2">{modelData?.name}</Typography>
            <Typography level="title-sm" pb={3}>
              {modelData?.uniqueID}
            </Typography>
            <Typography pb={2}>
              <Box sx={{ maxHeight: '200px', overflow: 'auto' }}>
                {modelData?.description}
              </Box>
            </Typography>
            <Typography>
              <b>Architecture:&nbsp;</b>
              {modelData?.architecture}
            </Typography>
            <Typography>
              <b>License:&nbsp;</b>
              {modelData?.license}
            </Typography>

            <Typography>
              <b>Parameters:&nbsp;</b>
              {modelData?.parameters}
            </Typography>
            <Typography>
              <b>Context:&nbsp;</b>
              {modelData?.context}
            </Typography>
          </div>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
