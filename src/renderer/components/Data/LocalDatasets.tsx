import { useState } from 'react';

import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

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
import { SearchIcon } from 'lucide-react';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import DatasetCard from './DatasetCard';
import NewDatasetModal from './NewDatasetModal';

import { fetcher } from '../../lib/transformerlab-api-sdk';
import { fetchWithAuth } from 'renderer/lib/authContext';

export function filterByFiltersDatasetID(
  data: Array<{ dataset_id?: string } & Record<string, any>>,
  searchText = '',
  filters: Record<string, string> = {},
) {
  const normalizedSearch = (searchText || '').toLowerCase();

  return data.filter((row) => {
    const datasetId = (row?.dataset_id || '').toLowerCase();

    if (!datasetId.includes(normalizedSearch)) {
      return false;
    }

    for (const filterKey in filters) {
      if (
        filters[filterKey] !== 'All' &&
        row[filterKey] !== filters[filterKey]
      ) {
        return false;
      }
    }

    return true;
  });
}
export default function LocalDatasets() {
  const [searchText, setSearchText] = useState('');
  const [newDatasetModalOpen, setNewDatasetModalOpen] = useState(false);
  const [downloadingDataset, setDownloadingDataset] = useState(null);
  const [showConfigNameField, setShowConfigNameField] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.LocalList(false),
    fetcher,
  );

  if (error)
    return 'Failed to retrieve local datasets. Ensure the backend is running and accessible.';
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
                  friendlyName={(() => {
                    try {
                      return (
                        (row?.json_data && JSON.parse(row.json_data)?.name) ||
                        row?.dataset_id
                      );
                    } catch {
                      return row?.dataset_id;
                    }
                  })()}
                  size={row?.size}
                  key={row.id}
                  description={row?.description}
                  repo={row.huggingfacerepo}
                  location={row?.location}
                  downloaded={true}
                  local={true}
                  parentMutate={mutate}
                  versionGroups={row?.version_groups || []}
                />
              </Grid>
            ))}

          {data?.length === 0 && (
            <Typography level="body-lg" justifyContent="center" margin={5}>
              No datasets are currently available. Datasets saved from jobs in
              this experiment will be available here.
            </Typography>
          )}
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
        <></>
      </Box>
    </Sheet>
  );
}
