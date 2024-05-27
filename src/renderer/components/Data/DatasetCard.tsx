import { useState } from 'react';

import {
  Button,
  Card,
  CardContent,
  CircularProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from '@mui/joy';
import {
  DownloadIcon,
  FileTextIcon,
  Trash2Icon,
  CheckIcon,
} from 'lucide-react';

import { formatBytes } from 'renderer/lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import PreviewDatasetModal from './PreviewDatasetModal';
import DatasetInfoModal from './DatasetInfoModal';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DatasetCard({
  name,
  size,
  description,
  repo,
  downloaded,
  location,
  parentMutate,
  local,
}) {
  const [installing, setInstalling] = useState(null);
  const [previewDatasetModalOpen, setPreviewDatasetModalOpen] = useState(false);
  const [datasetInfoModalOpen, setDatasetInfoModalOpen] = useState(false);

  return (
    <>
      {previewDatasetModalOpen && (
        <PreviewDatasetModal
          open={previewDatasetModalOpen}
          setOpen={setPreviewDatasetModalOpen}
          dataset_id={name}
        />
      )}
      <DatasetInfoModal
        open={datasetInfoModalOpen}
        dataset_id={name}
        setOpen={setDatasetInfoModalOpen}
      />
      <Card variant="outlined" sx={{}}>
        <div>
          <Typography
            level="h4"
            sx={{ mb: 0.5, height: '40px', overflow: 'clip' }}
            startDecorator={<FileTextIcon />}
          >
            <b>{name}</b>&nbsp;
            {location === 'huggingfacehub' && ' 🤗'}
            {location === 'local' && ' (local)'}
          </Typography>
          <div style={{ height: '100px', overflow: 'clip' }}>
            <Typography
              level="body-sm"
              sx={{
                overflow: 'auto',
                mt: 2,
                mb: 2,
              }}
            >
              {description}
            </Typography>
          </div>
        </div>
        <CardContent orientation="horizontal">
          <div>
            <Typography level="body3">Total size:</Typography>
            <Typography fontSize="lg" fontWeight="lg">
              {size === -1 ? 'Unknown' : formatBytes(size)}
            </Typography>
          </div>
        </CardContent>
        <CardContent orientation="horizontal">
          {downloaded && local && (
            <>
              <Button
                color="neutral"
                variant="outlined"
                onClick={async () => {
                  await fetch(chatAPI.Endpoints.Dataset.Delete(name));
                  parentMutate();
                }}
              >
                <Trash2Icon />
              </Button>
              <Button
                variant="solid"
                color="primary"
                sx={{ ml: 'auto' }}
                onClick={() => setPreviewDatasetModalOpen(true)}
              >
                Preview
              </Button>
              <Button
                variant="soft"
                onClick={async () => {
                  setDatasetInfoModalOpen(true);
                }}
              >
                Info
              </Button>
            </>
          )}
          {!local && (
            <Button
              variant="solid"
              size="sm"
              color="primary"
              aria-label="Download"
              sx={{ ml: 'auto' }}
              disabled={downloaded || installing}
              endDecorator={
                downloaded ? (
                  <CheckIcon />
                ) : installing ? (
                  <CircularProgress />
                ) : (
                  <DownloadIcon size="18px" />
                )
              }
              onClick={() => {
                setInstalling(true);

                // Datasets can be very large so do this asynchronously
                fetch(chatAPI.Endpoints.Dataset.Download(repo))
                  .then((response) => {
                    if (!response.ok) {
                      console.log(response);
                      throw new Error(`HTTP Status: ${response.status}`);
                    }
                    return response.json();
                  })
                  .then((response_json) => {
                    if (response_json?.status == 'error') {
                      throw new Error(response_json.message);
                    }
                    setInstalling(null);
                  })
                  .catch((error) => {
                    setInstalling(null);
                    alert('Download failed:\n' + error);
                  });
              }}
            >
              {downloaded
                ? 'Downloaded'
                : installing
                ? 'Downloading'
                : 'Download'}{' '}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
