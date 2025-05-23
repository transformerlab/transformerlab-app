import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import CardContent from '@mui/joy/CardContent';
import Typography from '@mui/joy/Typography';
import { DownloadIcon, RotateCcwIcon, Type } from 'lucide-react';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { Box, ButtonGroup, Chip, CircularProgress, Stack } from '@mui/joy';
import { Link } from 'react-router-dom';
import { useState } from 'react';

import { colorArray, mixColorWithBackground } from 'renderer/lib/utils';
import ShowArchitectures from '../Shared/ListArchitectures';

const fetcher = (url) => fetch(url).then((res) => res.json());

function getTint(type: string) {
  var tint = '';

  switch (type) {
    case 'evaluator':
      tint = colorArray[0];
      break;
    case 'trainer':
      tint = colorArray[1];
      break;
    case 'loader':
      tint = colorArray[2];
      break;
    case 'exporter':
      tint = colorArray[3];
      break;
    case 'rag':
      tint = colorArray[4];
      break;
    case 'generator':
      tint = colorArray[5];
      break;
    default:
      tint = 'var(--joy-palette-background-surface)';
  }

  // Now mix the Tint color with the background color
  // so that this works in dark and light mode
  return mixColorWithBackground(tint, '75');
}

export default function PluginCard({
  plugin,
  type,
  download,
  parentMutate,
  experimentInfo = {},
  machineType,
  setLogsDrawerOpen = null,
  isExperimental = false,
}) {
  const [installing, setInstalling] = useState(null);

  // eslint-disable-next-line react/no-unstable-nested-components
  function WillThisPluginWorkOnMyMachine({ pluginArchitectures, machineType }) {
    if (!pluginArchitectures) return null;

    // Check if plugin is compatible with the machine type
    let isCompatible = false;

    if (machineType === 'apple_silicon') {
      isCompatible =
        pluginArchitectures.includes('mlx') ||
        pluginArchitectures.includes('cpu');
    } else if (machineType === 'nvidia') {
      isCompatible =
        pluginArchitectures.includes('cuda') ||
        pluginArchitectures.includes('cpu');
    } else if (machineType === 'amd') {
      isCompatible = pluginArchitectures.includes('amd');
    } else {
      isCompatible = pluginArchitectures.includes('cpu');
    }

    // Only show a message for incompatible plugins
    if (!isCompatible) {
      return (
        <Typography level="body-xs" color="warning">
          Not compatible with your hardware
        </Typography>
      );
    }

    // Return null for compatible plugins (no message)
    return null;
  }

  return (
    <Card
      orientation="horizontal"
      sx={{
        height: '100%',
        backgroundColor: getTint(type),
      }}
    >
      <CardContent
        orientation="vertical"
        sx={{ justifyContent: 'space-between' }}
      >
        <Box>
          <Typography level="title-lg">
            <b>
              {plugin.name}&nbsp;
              <Chip>{type}</Chip>
            </b>
          </Typography>
          <Typography level="body-md" fontSize="sm" sx={{ mt: 0.0, mb: 1 }}>
            {/* {plugin.uniqueId}&nbsp; */}
            {plugin?.gallery_version ? (
              plugin?.version != plugin?.gallery_version ? (
                <Chip color="danger">v{plugin.version} Needs Upgrade</Chip>
              ) : (
                <>v{plugin.version}</>
              )
            ) : (
              <>v{plugin.version}</>
            )}
          </Typography>

          <Typography
            level="body-sm"
            sx={{
              display: '-webkit-box',
              '-webkit-line-clamp': '2',
              '-webkit-box-orient': 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              wordBreak: 'break-word',
            }}
          >
            {plugin.description}
          </Typography>
        </Box>
        <Box
          display="flex"
          flexDirection="row"
          gap={1}
          justifyItems="center"
          justifyContent="space-between"
          alignItems="center"
        >
          {plugin?.supported_hardware_architectures && (
            <Box sx={{ mt: 1 }}>
              {Array.isArray(plugin?.supported_hardware_architectures) &&
              plugin?.supported_hardware_architectures.length === 0 ? (
                <Chip color="warning" variant="soft">
                  Deprecated
                </Chip>
              ) : (
                <>
                  <Typography level="title-sm" fontSize="sm">
                    Supported Architectures:
                  </Typography>
                  <Stack
                    flexDirection={'row'}
                    gap={1}
                    sx={{ alignItems: 'center' }}
                  >
                    <ShowArchitectures
                      architectures={plugin?.supported_hardware_architectures}
                    />
                  </Stack>
                  <WillThisPluginWorkOnMyMachine
                    pluginArchitectures={
                      plugin?.supported_hardware_architectures
                    }
                    machineType={machineType}
                  />
                </>
              )}
              {isExperimental && (
                <Chip
                  color="warning"
                  variant="soft"
                  sx={{
                    mt: 1,
                    backgroundColor: 'warning.softBg',
                    color: 'warning.700',
                    maxWidth: 160,
                    whiteSpace: 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    wordBreak: 'break-word',
                    fontSize: '0.75rem',
                    lineHeight: 1.2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    minHeight: 32,
                    px: 1.5,
                  }}
                >
                  This is an experimental plugin
                </Chip>
              )}
            </Box>
          )}
          <ButtonGroup
            sx={{
              mt: 1,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            {!download && (
              <>
                <Link
                  to={'/plugins/' + plugin.uniqueId}
                  style={{ textDecoration: 'none', color: 'white' }}
                  state={plugin}
                >
                  <Button variant="plain" color="primary" sx={{ ml: 'auto' }}>
                    Edit
                  </Button>
                </Link>
              </>
            )}
            {!download && (
              <>
                <Button
                  variant="plain"
                  color="danger"
                  onClick={async () => {
                    if (
                      confirm('Are you sure you want to delete this plugin?')
                    ) {
                      await fetch(
                        chatAPI.Endpoints.Experiment.DeletePlugin(
                          experimentInfo?.id,
                          plugin?.uniqueId,
                        ),
                      );
                      parentMutate();
                    }
                  }}
                >
                  Delete
                </Button>
              </>
            )}
            <Button
              variant={plugin?.installed ? 'outlined' : 'solid'}
              size="sm"
              color="primary"
              aria-label="Download"
              endDecorator={
                plugin?.installed == true ? (
                  <RotateCcwIcon size={16} />
                ) : (
                  <DownloadIcon size={16} />
                )
              }
              onClick={async () => {
                setInstalling(plugin.uniqueId);
                await fetch(
                  chatAPI.Endpoints.Experiment.InstallPlugin(
                    experimentInfo?.id,
                    plugin.uniqueId,
                  ),
                ).then(async (response) => {
                  if (response.ok) {
                    const responseBody = await response.json();
                    console.log('Response Body:', responseBody);
                    if (responseBody?.status == 'error') {
                      alert(
                        `Failed to install plugin:\n${responseBody?.message}`,
                      );
                      if (setLogsDrawerOpen) {
                        setLogsDrawerOpen(true);
                      }
                    }
                  } else {
                    alert(
                      'Error: The API did not return a response. Plugin installation failed.',
                    );
                  }
                });
                setInstalling(null);
                parentMutate();
              }}
            >
              {installing == plugin.uniqueId && (
                <>
                  <CircularProgress />
                  &nbsp;
                </>
              )}
              {plugin?.installed == true ? <>Reinstall&nbsp;</> : <>Install</>}
            </Button>
          </ButtonGroup>
        </Box>
      </CardContent>
    </Card>
  );
}
