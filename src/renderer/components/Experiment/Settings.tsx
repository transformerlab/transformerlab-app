/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';
import { Button, Chip, Divider, Switch, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useState } from 'react';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ExperimentSettings({
  experimentInfo,
  setExperimentId,
  experimentInfoMutate,
}) {
  const [showJSON, setShowJSON] = useState(false);

  if (!experimentInfo) {
    return null;
  }
  return (
    <Sheet
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography level="h1">Experiment Settings</Typography>
      <Sheet sx={{ overflowY: 'auto', overflowX: 'hidden', mb: '2rem' }}>
        <Divider sx={{ mt: 2, mb: 2 }} />
        Show Experiment Details (JSON):&nbsp;
        <Switch checked={showJSON} onChange={() => setShowJSON(!showJSON)} />
        <pre
          style={{
            display: showJSON ? 'block' : 'none',
          }}
        >
          {JSON.stringify(experimentInfo, null, 2)}
        </pre>
        <Divider sx={{ mt: 2, mb: 2 }} />
        <Button
          color="danger"
          variant="outlined"
          onClick={() => {
            if (
              confirm(
                'Are you sure you want to delete this project? If you click on "OK" There is no way to recover it.',
              )
            ) {
              fetch(chatAPI.DELETE_EXPERIMENT_URL(experimentInfo?.id));
              setExperimentId(null);
            }
          }}
        >
          Delete Project {experimentInfo?.name}
        </Button>
      </Sheet>
    </Sheet>
  );
}
