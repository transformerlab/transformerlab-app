import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import CardContent from '@mui/joy/CardContent';
import Typography from '@mui/joy/Typography';
import {
  ArrowRightFromLineIcon,
  DownloadIcon,
  FolderSearch2Icon,
  GraduationCapIcon,
  HelpCircleIcon,
  RocketIcon,
  RotateCcwIcon,
} from 'lucide-react';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { ButtonGroup, CardActions, Chip, CircularProgress } from '@mui/joy';
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
    case 'rag':
      return <FolderSearch2Icon color="skyblue" />;
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
      <Card
        variant="outlined"
        sx={{
          minHeight: '250px',
          overflow: 'hidden',
        }}
      >
        <CardContent orientation="vertical">
          <>
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
            <Typography level="body-md" fontSize="sm" sx={{ mt: 0.5, mb: 0.5 }}>
              {/* {plugin.uniqueId}&nbsp; */}
              {plugin?.gallery_version ? (
                plugin?.version != plugin?.gallery_version ? (
                  <Chip color="danger">v{plugin.version} Needs Upgrade</Chip>
                ) : (
                  <>
                    <Chip color="success" variant="outlined">
                      v{plugin.version}
                    </Chip>
                  </>
                )
              ) : (
                <Chip color="warning" variant="outlined">
                  v{plugin.version}
                </Chip>
              )}
            </Typography>

            <Typography level="body-md">{plugin.description}</Typography>
          </>
        </CardContent>

        <CardActions
          buttonFlex="0 1 120px"
          sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}
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
                to={'/projects/plugins/' + plugin.uniqueId}
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
          <Button
            variant={plugin?.installed ? 'plain' : 'solid'}
            size="sm"
            color="primary"
            aria-label="Download"
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
        </CardActions>
      </Card>
    </>
  );
}
