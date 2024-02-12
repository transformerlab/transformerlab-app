import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import CardContent from '@mui/joy/CardContent';
import Typography from '@mui/joy/Typography';
import {
  ArrowRightFromLineIcon,
  DownloadIcon,
  GraduationCapIcon,
  HelpCircleIcon,
  RocketIcon,
  RotateCcwIcon,
} from 'lucide-react';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { Chip, CircularProgress } from '@mui/joy';
import { Link } from 'react-router-dom';
import { useState } from 'react';

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
    default:
      return null;
  }
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
      <Card variant="outlined" sx={{}}>
        <div>
          <Typography
            level="title-md"
            fontSize="md"
            sx={{ mb: 0.5 }}
            startDecorator={getIcon(type)}
          >
            <b>{plugin.name}</b>
          </Typography>
          <Typography level="body-md" fontSize="sm" sx={{ mt: 0.5, mb: 0.5 }}>
            {plugin.uniqueId}
          </Typography>
          <Typography level="title-sm" fontSize="sm" sx={{ mt: 0.5, mb: 0.5 }}>
            <b>
              Type: <Chip>{type}</Chip>
            </b>
          </Typography>

          <Typography
            level="body-md"
            sx={{
              overflow: 'auto',
              mt: 2,
              mb: 2,
            }}
          >
            {plugin.description}
          </Typography>
        </div>
        <CardContent orientation="horizontal"></CardContent>
        <CardContent orientation="horizontal">
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
                to={'/projects/plugins/' + plugin.uniqueId}
                style={{ textDecoration: 'none', color: 'white' }}
                state={plugin}
              >
                <Button variant="solid" color="primary" sx={{ ml: 'auto' }}>
                  Edit
                </Button>
              </Link>

              <Button
                variant="plain"
                color="danger"
                onClick={async () => {
                  if (confirm('Are you sure you want to delete this plugin?')) {
                    await fetch(
                      chatAPI.Endpoints.Experiment.DeletePlugin(
                        experimentInfo?.id,
                        plugin?.uniqueId
                      )
                    );
                    parentMutate();
                  }
                }}
              >
                Delete
              </Button>
            </>
          )}
          {download && (
            <Button
              variant={plugin?.installed ? 'soft' : 'solid'}
              size="sm"
              color="primary"
              aria-label="Download"
              sx={{ ml: 'auto' }}
              onClick={async () => {
                setInstalling(plugin.uniqueId);
                await fetch(
                  chatAPI.Endpoints.Experiment.InstallPlugin(
                    experimentInfo?.id,
                    plugin.uniqueId
                  )
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
                  Reinstall &nbsp;
                  <RotateCcwIcon size={16} />
                </>
              ) : (
                <>
                  Install &nbsp;
                  <DownloadIcon size={16} />
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
