import useSWR from 'swr';

import {
  FormControl,
  FormLabel,
  Grid,
  Input,
  LinearProgress,
  Select,
  Sheet,
  Option,
  Box,
  Chip,
} from '@mui/joy';
import PluginCard from './PluginCard';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { filterByFilters } from 'renderer/lib/utils';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PluginGallery({ experimentInfo }) {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Plugins.Gallery(),
    fetcher
  );
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({});

  const renderFilters = () => (
    <>
      <FormControl size="sm" sx={{ flex: 1 }}>
        <FormLabel>Plugin Type</FormLabel>
        <Select
          placeholder="Filter by Type"
          slotProps={{ button: { sx: { whiteSpace: 'nowrap' } } }}
          value={filters?.license}
          onChange={(e, newValue) => {
            setFilters({ ...filters, type: newValue });
          }}
        >
          {['All', 'trainer', 'evaluator', 'loader', 'exporter', 'rag'].map(
            (type) => (
              <Option value={type}>
                <Chip>{type}</Chip>
              </Option>
            )
          )}
        </Select>
      </FormControl>
    </>
  );

  if (error)
    return (
      'An error has occurred.' + chatAPI.Endpoints.Plugins.Gallery() + error
    );
  if (isLoading) return <LinearProgress />;
  return (
    <>
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
          <FormLabel>&nbsp;</FormLabel>
          <Input
            placeholder="Search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </FormControl>

        {renderFilters()}
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
            filterByFilters(data, searchText, filters).map((row) => (
              <Grid xs={4}>
                <PluginCard
                  plugin={row}
                  key={row.id}
                  type={row.type}
                  download
                  experimentInfo={experimentInfo}
                  parentMutate={mutate}
                />
              </Grid>
            ))}
        </Grid>
      </Sheet>
    </>
  );
}
