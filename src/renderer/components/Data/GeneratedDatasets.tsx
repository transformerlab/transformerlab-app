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
  CircularProgress,
  FormLabel,
  Typography,
} from '@mui/joy';
import { PlusIcon, SearchIcon, StoreIcon } from 'lucide-react';
import { Link as ReactRouterLink } from 'react-router-dom';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import DatasetCard from './DatasetCard';
import NewDatasetModal from './NewDatasetModal';

const fetcher = (url) => fetch(url).then((res) => res.json());

export function filterByFiltersDatasetID(data, searchText = '', filters = {}) {
  return data.filter((row) => {
    if (row.dataset_id.toLowerCase().includes(searchText.toLowerCase())) {
      for (const filterKey in filters) {
        console.log(filterKey, filters[filterKey]);
        if (filters[filterKey] !== 'All') {
          if (row[filterKey] !== filters[filterKey]) {
            return false;
          }
        }
      }
      return true;
    }
    return false;
  });
}
export default function GeneratedDatasets() {
  const [searchText, setSearchText] = useState('');
  // const [newDatasetModalOpen, setNewDatasetModalOpen] = useState(false);
  // const [downloadingDataset, setDownloadingDataset] = useState(null);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.GeneratedList(),
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
      {/* <NewDatasetModal
        open={newDatasetModalOpen}
        setOpen={setNewDatasetModalOpen}
      /> */}
      <Box
        className="SearchAndFilters-tabletUp"
        sx={{
          borderRadius: 'sm',
          pb: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          '& > *': {
            minWidth: {
              xs: '120px',
              md: '160px',
            },
          },
        }}
      >
        <FormControl sx={{ flex: 2 }} size="sm">
          <Input
            placeholder="Search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </FormControl>
      </Box>
      <Sheet
        className="OrderTableContainer"
        variant="outlined"
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: 'md',
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          padding: 2,
        }}
      >
        <Grid container spacing={2} sx={{ flexGrow: 1 }}>
          {data &&
            filterByFiltersDatasetID(data, searchText).map((row) => (
              <Grid xs={4}>
                <DatasetCard
                  name={row?.dataset_id}
                  size={row?.size}
                  key={row.id}
                  description={row?.description}
                  repo={row.huggingfacerepo}
                  location={row?.location}
                  downloaded={true}
                  local={true}
                  parentMutate={mutate}
                />
              </Grid>
            ))}

          {data?.length === 0 && (
            <Typography level="body-lg" justifyContent="center" margin={5}>
              You do not have any generated datasets. You can
              download a dataset by going to the Generate Tab in an experiment.
              {/* <ReactRouterLink to="/generate">
                <StoreIcon />
                Generated Tab
              </ReactRouterLink>
              . */}
            </Typography>
          )}
        </Grid>
      </Sheet>
      {/* <Box
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
                    const dataset = document.getElementsByName(
                      'download-dataset-name'
                    )[0].value;
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
                          // now mutate:
                          mutate();
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
                      ''
                    )
                  }
                >
                  {downloadingDataset ? 'Downloading' : 'Download 🤗 Dataset'}
                </Button>
              }
              sx={{ width: '500px' }}
            />
          </FormControl>
          <>
            {/* <Button
              size="sm"
              sx={{ height: '30px' }}
              endDecorator={<PlusIcon />}
              onClick={() => {
                setNewDatasetModalOpen(true);
              }}
            >
              New
            </Button> */}
          {/* </>
        </>
      </Box> */}
    </Sheet>
  );
}
