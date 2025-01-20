import useSWR from 'swr';
import { useState } from 'react';

import {
  FormControl,
  FormLabel,
  Grid,
  Input,
  LinearProgress,
  Sheet,
  Box,
} from '@mui/joy';
import DatasetCard from './DatasetCard';
import { SearchIcon } from 'lucide-react';
import { filterByFilters } from 'renderer/lib/utils';

import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DataStore() {
  const [searchText, setSearchText] = useState('');
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.Gallery(),
    fetcher
  );

  if (error) return 'An error has occurred.';
  if (isLoading) return <LinearProgress />;
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
      }}
    >
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
            data.data &&
            filterByFilters(data.data, searchText).map((row) => (
              <Grid xs={4}>
                <DatasetCard
                  name={row.name}
                  size={row.size}
                  description={row.description}
                  repo={row.huggingfacerepo}
                  downloaded={row.downloaded}
                  local={false}
                  location={undefined}
                  parentMutate={mutate}
                />
              </Grid>
            ))}
        </Grid>
      </Sheet>
    </Sheet>
  );
}
