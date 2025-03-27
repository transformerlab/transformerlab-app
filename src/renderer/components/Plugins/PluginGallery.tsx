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
  Typography,
} from '@mui/joy';

import { useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { filterByFilters } from 'renderer/lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import PluginCard from './PluginCard';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PluginGallery({ experimentInfo }) {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Plugins.Gallery(),
    fetcher,
  );

  const { data: serverInfo } = useSWR(
    chatAPI.Endpoints.ServerInfo.Get(),
    fetcher,
  );

  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({});

  const device = serverInfo?.device;

  const renderFilters = () => (
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
        {[
          'All',
          'generator',
          'trainer',
          'evaluator',
          'loader',
          'exporter',
          'rag',
        ].map((type) => (
          <Option value={type}>
            <Chip>{type}</Chip>
          </Option>
        ))}
      </Select>
    </FormControl>
  );

  const groupByType = (plugins) => {
    return plugins.reduce((acc, plugin) => {
      const { type } = plugin;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(plugin);
      return acc;
    }, {});
  };

  if (error)
    return `An error has occurred.${chatAPI.Endpoints.Plugins.Gallery()}${error}`;
  if (isLoading) return <LinearProgress />;

  const filteredPlugins = filterByFilters(data, searchText, filters);
  const groupedPlugins = groupByType(filteredPlugins);

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
        variant="plain"
        sx={{
          width: '100%',
          height: '100%',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: 0,
          paddingRight: 2,
        }}
      >
        {Object.keys(groupedPlugins).map((type) => (
          <Box key={type} sx={{ mb: 4 }}>
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--joy-palette-background-surface)',
                zIndex: 100,
              }}
            >
              <Typography
                level="h4"
                sx={{
                  mb: 2,
                  textTransform: 'capitalize',
                }}
              >
                {type} Plugins:
              </Typography>
            </Box>
            <Grid container spacing={2} sx={{ flexGrow: 1 }}>
              {groupedPlugins[type].map((plugin) => (
                <Grid xs={4} key={plugin.id}>
                  <PluginCard
                    plugin={plugin}
                    type={plugin.type}
                    download
                    experimentInfo={experimentInfo}
                    parentMutate={mutate}
                    machineType={device}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Sheet>
    </>
  );
}
