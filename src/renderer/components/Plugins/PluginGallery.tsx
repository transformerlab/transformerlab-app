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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Chip,
  Typography,
} from '@mui/joy';

import { useState, useEffect } from 'react';
import { SearchIcon } from 'lucide-react';
import { filterByFilters } from 'renderer/lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import PluginCard from './PluginCard';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PluginGallery({
  experimentInfo,
  setLogsDrawerOpen = null,
}) {
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
  const [showExperimental, setShowExperimental] = useState(false);

  useEffect(() => {
    async function fetchShowExperimental() {
      const value = await window.storage.get('SHOW_EXPERIMENTAL_PLUGINS');
      setShowExperimental(value === 'true');
    }
    fetchShowExperimental();
  }, []);

  const device = serverInfo?.device_type;

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

  const isPluginCompatible = (plugin, machineType) => {
    if (!plugin.supported_hardware_architectures) return true; // Default to compatible if no information

    if (machineType === 'apple_silicon') {
      return (
        plugin.supported_hardware_architectures.includes('mlx') ||
        plugin.supported_hardware_architectures.includes('cpu')
      );
    }

    if (machineType === 'nvidia') {
      return (
        plugin.supported_hardware_architectures.includes('cuda') ||
        plugin.supported_hardware_architectures.includes('cpu')
      );
    }
    if (machineType === 'amd') {
      return plugin.supported_hardware_architectures.includes('amd');
    }

    return true; // Default to compatible for unknown machine types
  };

  const groupByType = (plugins, machineType) => {
    return plugins.reduce((acc, plugin) => {
      const { type } = plugin;
      const compatible = isPluginCompatible(plugin, machineType);

      if (!acc[type]) {
        acc[type] = { compatible: [], incompatible: [] };
      }

      if (compatible) {
        acc[type].compatible.push(plugin);
      } else {
        acc[type].incompatible.push(plugin);
      }

      return acc;
    }, {});
  };

  if (error)
    return `Failed to load plugin gallery from ${chatAPI.Endpoints.Plugins.Gallery()}. Error: ${error}`;
  if (isLoading) return <LinearProgress />;

  // Filter plugins based on experimental flag and toggle
  const filteredPlugins = filterByFilters(data, searchText, filters).filter(
    (plugin) => {
      // If plugin is experimental, only show if toggle is enabled
      if (
        Array.isArray(plugin?.supports) &&
        plugin.supports.includes('experimental')
      ) {
        return showExperimental;
      }
      // Otherwise, always show
      return true;
    },
  );
  const groupedPlugins = groupByType(filteredPlugins, device);

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

            {/* Compatible plugins */}
            {groupedPlugins[type].compatible.length > 0 && (
              <Grid container spacing={2} sx={{ flexGrow: 1 }}>
                {groupedPlugins[type].compatible.map((plugin) => (
                  <Grid xs={4} key={plugin.id}>
                    <PluginCard
                      plugin={plugin}
                      type={plugin.type}
                      download
                      experimentInfo={experimentInfo}
                      parentMutate={mutate}
                      machineType={device}
                      setLogsDrawerOpen={setLogsDrawerOpen}
                      isExperimental={
                        Array.isArray(plugin?.supports) &&
                        plugin.supports.includes('experimental')
                      }
                    />
                  </Grid>
                ))}
              </Grid>
            )}

            {/* Incompatible plugins */}
            {groupedPlugins[type].incompatible.length > 0 && (
              <Accordion
                sx={{ mt: 3 }}
                defaultExpanded={false}
                variant="plain"
              >
                <AccordionSummary>
                  <Typography
                    level="title-sm"
                    sx={{
                      color: 'text.secondary',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      width: '100%',
                      pb: 1,
                    }}
                  >
                    {`Incompatible ${type} plugins (${groupedPlugins[type].incompatible.length})`}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2} sx={{ flexGrow: 1 }}>
                    {groupedPlugins[type].incompatible.map((plugin) => (
                      <Grid xs={4} key={plugin.id}>
                        <Box sx={{ opacity: 0.6 }}>
                          <PluginCard
                            plugin={plugin}
                            type={plugin.type}
                            download
                            experimentInfo={experimentInfo}
                            parentMutate={mutate}
                            machineType={device}
                            setLogsDrawerOpen={setLogsDrawerOpen}
                            isExperimental={
                              Array.isArray(plugin?.supports) &&
                              plugin.supports.includes('experimental')
                            }
                          />
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}
          </Box>
        ))}
      </Sheet>
    </>
  );
}
