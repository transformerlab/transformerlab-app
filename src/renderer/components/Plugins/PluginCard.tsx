import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import CardContent from '@mui/joy/CardContent';
import Typography from '@mui/joy/Typography';
import { DownloadIcon, RotateCcwIcon, Type } from 'lucide-react';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { Box, Chip, CircularProgress, Stack } from '@mui/joy';
import { Link } from 'react-router-dom';
import { useState } from 'react';

import TinyMLXLogo from '../Shared/TinyMLXLogo';
import TinyNVIDIALogo from '../Shared/TinyNVIDIALogo';

const fetcher = (url) => fetch(url).then((res) => res.json());

function getIcon(type: string) {
  switch (type) {
    case 'evaluator':
      return <HelpCircleIcon color="#C21292" />;
    case 'trainer':
      return <GraduationCapIcon color="#EF4040" />;
    case 'loader':
      return <RocketIcon color="#FFA732" />;
    case 'exporter':
      return <ArrowRightFromLineIcon color="#711DB0" />;
    case 'rag':
      return <FolderSearch2Icon color="skyblue" />;
    default:
      tint = 'var(--joy-palette-background-surface)';
  }

  // Now mix the Tint color with the background color
  // so that this works in dark and light mode
  return (
    'color-mix(in srgb, ' +
    tint +
    ', var(--joy-palette-background-surface) 50%)'
  );
}

function mapArchitectureToIcon(arch) {
  switch (arch) {
    case 'cuda':
      return (
        <>
          <TinyNVIDIALogo /> CUDA
        </>
      );
    case 'mlx':
      return <TinyMLXLogo />;
    default:
      return (
        <Chip key={arch} color="primary">
          {arch}
        </Chip>
      );
  }
}

function ShowArchitectures({ architectures }) {
  if (!architectures) return null;
  return (
    <>
      {architectures.map((arch) => (
        <div key={arch}>{mapArchitectureToIcon(arch)}</div>
      ))}
    </>
  );
}

export default function PluginCard({
  plugin,
  type,
  download,
  parentMutate,
  experimentInfo = {},
}) {
  const [installing, setInstalling] = useState(null);

  return (
    <>
      <Card orientation="horizontal" sx={{ height: '100%' }}>
        <CardContent
          orientation="vertical"
          sx={{ justifyContent: 'space-between' }}
        >
          <Box>
            {/* {JSON.stringify(plugin)} */}
            <Typography
              level="title-lg"
              // startDecorator={getIcon(type)}
            >
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

            <Typography level="body-md">{plugin.description}</Typography>
          </Box>
          {plugin?.supported_hardware_architectures && (
            <Box sx={{ mt: 1 }}>
              <Typography level="title-sm" fontSize="sm">
                Supported Architectures:
              </Typography>
              <Stack flexDirection={'row'} gap={1}>
                <ShowArchitectures
                  architectures={plugin?.supported_hardware_architectures}
                />
              </Stack>
            </Box>
          )}

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              mt: 1,
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 1,
            }}
          >
            {!download && (
              <>
                {/* <Button
                color="neutral"
                variant="outlined"
                onClick={async () => {
                  await fetch(chatAPI.Endpoints.Dataset.Delete(plugin.name));
                  parentMutate();
                }}
              >
                <Trash2Icon />
              </Button> */}
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
              onClick={async () => {
                setInstalling(plugin.uniqueId);
                await fetch(
                  chatAPI.Endpoints.Experiment.InstallPlugin(
                    experimentInfo?.id,
                    plugin.uniqueId,
                  ),
                );
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
              {plugin?.installed == true ? (
                <>
                  Reinstall&nbsp;
                  <RotateCcwIcon size={16} />
                </>
              ) : (
                <>
                  Install &nbsp;
                  <DownloadIcon size={16} />
                </>
              )}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </>
  );
}
