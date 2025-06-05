import { useState, useEffect } from 'react';
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
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import PreviewDatasetModal from './PreviewDatasetModal';
import DatasetInfoModal from './DatasetInfoModal';
import EditDatasetModal from './EditDatasetModal';

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
  const [previewModalState, setPreviewModalState] = useState({
    open: false,
    datasetId: null,
    viewType: 'preview',
  });
  const [datasetInfoModalOpen, setDatasetInfoModalOpen] = useState(false);
  const [editDatasetModalOpen, setEditDatasetModalOpen] = useState(false);

  const { data: datasetInfo } = useAPI('datasets', ['info'], {
    datasetId: name,
  });

  return (
    <>
      <PreviewDatasetModal
        open={previewModalState.open}
        setOpen={(open) => setPreviewModalState({ ...previewModalState, open })}
        dataset_id={previewModalState.datasetId}
        viewType={previewModalState.viewType}
      />

      {editDatasetModalOpen && (
        <EditDatasetModal
          open={editDatasetModalOpen}
          setOpen={setEditDatasetModalOpen}
          datasetId={name}
          template="default"
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
              <Typography level="body-sm" sx={{ overflow: 'auto' }}>
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
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 1,
            justifyContent: 'flex-end',
          }}
        >
          {downloaded && (
            <>
              <Tooltip title="Delete">
                <Button
                  color="neutral"
                  variant="outlined"
                  sx={{ flex: '1 1 auto', minWidth: 120 }}
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
                  sx={{ flex: '1 1 auto', minWidth: 120 }}
                  onClick={() => {
                    setPreviewModalState({
                      open: true,
                      datasetId: name,
                      viewType: 'preview',
                    });
                  }}
                >
                  <EyeIcon />
                </Button>
              </Tooltip>

              {local && datasetInfo?.is_image && (
                <Tooltip title="Edit">
                  <Button
                    variant="solid"
                    color="primary"
                    sx={{ flex: '1 1 auto', minWidth: 120 }}
                    onClick={() => setEditDatasetModalOpen(true)}
                  >
                    <Edit3Icon />
                  </Button>
                </Tooltip>
              )}

              <Tooltip title="Info">
                <Button
                  variant="soft"
                  sx={{ flex: '1 1 auto', minWidth: 120 }}
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
              sx={{ flex: '1 1 auto', minWidth: 120 }}
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
                  : 'Download'}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
