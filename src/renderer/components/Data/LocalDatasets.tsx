import { useState } from 'react';

import useSWR from 'swr';

import {
  Box,
  Button,
  FormControl,
  Grid,
  Input,
  LinearProgress,
  Sheet,
  CircularProgress
} from '@mui/joy';
import { PlusIcon } from 'lucide-react';
import DatasetCard from './DatasetCard';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import NewDatasetModal from './NewDatasetModal';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function LocalDatasets() {
  const [newDatasetModalOpen, setNewDatasetModalOpen] = useState(false);
  const [downloadingDataset, setDownloadingDataset] = useState(null);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.LocalList(),
    fetcher
  );

  if (error) return 'An error has occurred.';
  if (isLoading) return <LinearProgress />;

  console.log(data);

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
      }}
    >
      <NewDatasetModal
        open={newDatasetModalOpen}
        setOpen={setNewDatasetModalOpen}
      />

      <Sheet
        variant="outlined"
        color="primary"
        sx={{
          width: '100%',
          borderRadius: 'md',
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          padding: 2,
        }}
      >
        <Grid container spacing={2} sx={{ flexGrow: 1 }}>
          {data.map((row) => (
            <Grid xs={4}>
              {/* {<pre>{JSON.stringify(row, null, 2)}</pre>} */}
              <DatasetCard
                name={row?.dataset_id}
                size={row?.size}
                key={row.id}
                description={row?.description}
                repo={row.huggingfacerepo}
                location={row?.location}
                parentMutate={mutate}
              />
            </Grid>
          ))}
        </Grid>
      </Sheet>
      <Box
        sx={{
          justifyContent: 'space-between',
          display: 'flex',
          width: '100%',
          paddingTop: '12px',
        }}
      >
        <>
          <FormControl>
            <Input
              placeholder="Open-Orca/OpenOrca"
              name="download-dataset-name"
              endDecorator={
                <Button
                  onClick={async (e) => {
                    const dataset = document.getElementsByName('download-dataset-name')[0].value;
                    // only download if valid model is entered
                    if (dataset) {
                      // this triggers UI changes while download is in progress
                      setDownloadingDataset(dataset);

                      // Datasets can be very large so do this asynchronously
                      fetch(chatAPI.Endpoints.Dataset.Download(dataset))
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
                          setDownloadingDataset(null);
                        })
                        .catch((error) => {
                          setDownloadingDataset(null);
                          alert('Download failed:\n' + error);
                        });
                    }
                  }}
                  startDecorator={
                    downloadingDataset ? (
                      <CircularProgress size="sm" thickness={2} />
                    ) : (
                      ""
                    )}
                >
                  {downloadingDataset ? (
                    "Downloading"
                  ) : (
                    "Download 🤗 Dataset"
                  )}
                </Button>
              }
              sx={{ width: '500px' }}
            />
          </FormControl>
          <>
            <Button
              size="sm"
              sx={{ height: '30px' }}
              endDecorator={<PlusIcon />}
              onClick={() => {
                setNewDatasetModalOpen(true);
              }}
            >
              New
            </Button>
          </>
        </>
      </Box>
    </Sheet>
  );
}
