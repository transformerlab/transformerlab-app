import { useState } from 'react';

import {
  Button,
  Card,
  CardContent,
  CircularProgress,
  Typography,
  Tooltip,
} from '@mui/joy';
import {
  DownloadIcon,
  FileTextIcon,
  Trash2Icon,
  CheckIcon,
  EyeIcon,
  Edit3Icon,
  InfoIcon,
} from 'lucide-react';

import { formatBytes } from 'renderer/lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import PreviewDatasetModal from './PreviewDatasetModal';
import DatasetInfoModal from './DatasetInfoModal';
import EditDatasetModal from './EditDatasetModal';

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
  friendlyName = null,
}) {
  const [installing, setInstalling] = useState(null);
  const [previewDatasetModalOpen, setPreviewDatasetModalOpen] = useState(false);
  const [datasetInfoModalOpen, setDatasetInfoModalOpen] = useState(false);
  const [editDatasetModalOpen, setEditDatasetModalOpen] = useState(false);
  const [previewViewType, setPreviewViewType] = useState('preview');
  const [datasetId, setDatasetId] = useState(name);

  return (
    <>
      {previewDatasetModalOpen && (
        <PreviewDatasetModal
          open={previewDatasetModalOpen}
          setOpen={setPreviewDatasetModalOpen}
          dataset_id={datasetId}
          viewType={previewViewType}
        />
      )}
      {editDatasetModalOpen && (
        <EditDatasetModal
          open={editDatasetModalOpen}
          setOpen={setEditDatasetModalOpen}
          dataset_id={name} // original dataset_id
          onConfirm={(newName) => {
            setDatasetId(newName); // Set to the new dataset
            setPreviewViewType('edit');
            setPreviewDatasetModalOpen(true); // Open preview on the new dataset
          }}
        />
      )}
      <DatasetInfoModal
        open={datasetInfoModalOpen}
        dataset_id={name}
        setOpen={setDatasetInfoModalOpen}
      />
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardContent
          orientation="vertical"
          sx={{ justifyContent: 'space-between' }}
        >
          <div>
            <Typography
              level="title-lg"
              sx={{ mb: 2, overflow: 'clip' }}
              startDecorator={<FileTextIcon />}
            >
              <b>{friendlyName || name}</b>&nbsp;
              {location === 'huggingfacehub' && ' 🤗'}
              {location === 'local' && ' '}
            </Typography>
            <div style={{ overflow: 'clip' }}>
              <Typography
                level="body-sm"
                sx={{
                  overflow: 'auto',
                }}
              >
                {description}
              </Typography>
            </div>
          </div>
          <div>
            <Typography level="title-sm">Total size:</Typography>
            <Typography fontSize="sm" fontWeight="bold">
              {size === -1 ? 'Unknown' : formatBytes(size)}
            </Typography>
          </div>
          <div>
            <Typography level="title-sm">Location:</Typography>
            <Typography fontSize="sm">
              {location === 'huggingfacehub' ? 'Hugging Face Hub' : 'Local'}
            </Typography>
          </div>
        </CardContent>
        <CardContent
          orientation="horizontal"
          sx={{ alignItems: 'flex-end', gap: 1 }}
        >
          {downloaded && (
            <>
              <Tooltip title="Delete">
                <Button
                  color="neutral"
                  variant="outlined"
                  onClick={async () => {
                    if (
                      confirm('Are you sure you want to delete this dataset?')
                    ) {
                      await fetch(chatAPI.Endpoints.Dataset.Delete(name));
                      parentMutate();
                    }
                  }}
                >
                  <Trash2Icon />
                </Button>
              </Tooltip>

              <Tooltip title="Preview">
                <Button
                  variant="solid"
                  color="primary"
                  sx={{ ml: 'auto' }}
                  onClick={() => {
                    setPreviewDatasetModalOpen(true);
                    setPreviewViewType('preview');
                  }}
                >
                  <EyeIcon />
                </Button>
              </Tooltip>

              {location.toLowerCase() === 'local' && (
                <Tooltip title="Edit">
                  <Button
                    variant="solid"
                    color="primary"
                    onClick={() => {
                      setEditDatasetModalOpen(true);
                    }}
                  >
                    <Edit3Icon />
                  </Button>
                </Tooltip>
              )}

              <Tooltip title="Info">
                <Button
                  variant="soft"
                  onClick={() => setDatasetInfoModalOpen(true)}
                >
                  <InfoIcon />
                </Button>
              </Tooltip>
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
                    parentMutate();
                  })
                  .catch((error) => {
                    setInstalling(null);
                    parentMutate();
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
