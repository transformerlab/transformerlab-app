import { StopCircleIcon } from 'lucide-react';
import {
  killWorker,
  useModelStatus,
} from 'renderer/lib/transformerlab-api-sdk';
import { Box, Button, CircularProgress, Typography } from '@mui/joy';
import TinyCircle from './Shared/TinyCircle';
import HelpVideoModal from './HelpVideoModal';
import { useState } from 'react';

export default function ModelCurrentlyPlaying({ experimentInfo }) {
  const { models, isError, isLoading } = useModelStatus();
  const [helpDialogOpen, setHelpDialogOpen] = useState<boolean>(false);

  const inferenceParams = experimentInfo?.config?.inferenceParams
    ? JSON.parse(experimentInfo?.config?.inferenceParams)
    : null;
  const eightBit = inferenceParams?.['8-bit'];
  const cpuOffload = inferenceParams?.['cpu-offload'];
  const engine = inferenceParams?.inferenceEngine;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        paddingRight: '8px',
        backgroundColor: 'var(--joy-palette-background-level2)',
        boxShadow: 'inset 0px 0px 4px 0px rgba(0,0,0,0.05)',
        '&:hover': {
          //background: 'var(--joy-palette-background-level3)',
          boxShadow: 'inset 0px 0px 10px 0px rgba(0,0,0,0.15)',
        },
      }}
    >
      {/* <RunModelButton
        experimentInfo={experimentInfo}
        killWorker={killWorker}
        models={models}
      /> */}
      {/* <HelpVideoModal open={helpDialogOpen} setOpen={setHelpDialogOpen} /> */}
      <Button
        variant="plain"
        disabled
        sx={{ display: models?.length > 0 ? 'none' : 'flex' }}
      >
        <StopCircleIcon style={{ color: 'transparent' }} />
      </Button>
      <Button
        onClick={async () => {
          await killWorker();
        }}
        color="neutral"
        startDecorator={null}
        variant="plain"
        sx={{ display: models?.length > 0 ? 'flex' : 'none' }}
      >
        {models?.length == 0 ? (
          <CircularProgress color="warning" />
        ) : (
          <StopCircleIcon />
        )}
      </Button>
      &nbsp;
      {models?.length > 0 ? <TinyCircle size={6} color="#51BC51" /> : ''}
      {models === null ? (
        <TinyCircle size={6} color="rgb(228, 116, 116)" />
      ) : (
        ''
      )}
      {isLoading ? (
        <TinyCircle size={6} color="var(--joy-palette-neutral-300)" />
      ) : (
        ''
      )}
      &nbsp;&nbsp;
      <Typography
        level="body-sm"
        sx={{
          m: 0,
          p: '0 8px',
          justifyContent: 'center',
          display: 'flex',
        }}
        className="xspin-border"
        onClick={() => {
          // if (!helpDialogOpen) {
          //   setHelpDialogOpen(true);
          // }
          let m = experimentInfo?.config?.foundation
            ? experimentInfo?.config?.foundation +
              ' selected. Click on the "Foundation" tab then "Eject" to change models.'
            : 'No model selected. Click on the "Foundation tab" to select a model';
          alert(m + ' ');
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            width: '160px',
            textWrap: 'nowrap',
            margin: 'auto',
          }}
        >
          {experimentInfo?.config == null
            ? 'Select an Experiment'
            : models?.[0]?.id
            ? models?.[0]?.id
            : experimentInfo?.config?.foundation
            ? experimentInfo?.config?.foundation
            : 'Select Foundation'}
        </span>
        {models?.[0]?.id && experimentInfo?.config?.inferenceParams ? (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: '10px',
              height: '30px',
              justifyContent: 'center',
            }}
          >
            {/* {JSON.stringify(experimentInfo?.config?.inferenceParams)} */}
            {/* <span>{eightBit && '8-bit'}</span>
            <span>{cpuOffload && 'cpu-offload'}</span> */}
            <span>{engine}</span>
          </span>
        ) : (
          ''
        )}
      </Typography>
    </Box>
  );
}
