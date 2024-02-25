import * as React from 'react';
import { useState } from 'react';

import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import CardContent from '@mui/joy/CardContent';
import Typography from '@mui/joy/Typography';
import { DownloadIcon, FileTextIcon, Trash2Icon } from 'lucide-react';

import { formatBytes } from 'renderer/lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import PreviewDatasetModal from './PreviewDatasetModal';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DatasetCard({
  name,
  size,
  description,
  repo,
  download = false,
  location,
  parentMutate,
}) {
  const [installing, setInstalling] = useState(null);
  const [previewDatasetModalOpen, setPreviewDatasetModalOpen] =
    React.useState(false);

  return (
    <>
      {previewDatasetModalOpen && (
        <PreviewDatasetModal
          open={previewDatasetModalOpen}
          setOpen={setPreviewDatasetModalOpen}
          dataset_id={name}
        />
      )}
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
          {!download && (
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
                  const response = await fetch(
                    chatAPI.Endpoints.Dataset.Info(name)
                  );
                  const info = await response.json();

                  alert(JSON.stringify(info));
                }}
              >
                Info
              </Button>
            </>
          )}
          {download && (
            <Button
              variant="solid"
              size="sm"
              color="primary"
              aria-label="Download"
              sx={{ ml: 'auto' }}
              disabled={installing}
              endDecorator={
                installing ? (
                  <CircularProgress />
                ) : (
                  <DownloadIcon size="18px" />
                )
              }
              onClick={() => {
                setInstalling(true);
                chatAPI.downloadData(repo);
                setInstalling(null);
                parentMutate();
              }}

            >
              {installing ? (
                "Downloading"
              ) : (
                "Download"
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
