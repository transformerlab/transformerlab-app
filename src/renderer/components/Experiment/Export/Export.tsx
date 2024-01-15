import { useState } from 'react';

import Sheet from '@mui/joy/Sheet';
import { Button, Chip, Divider, Switch, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function Export({
    experimentInfo,
  }) {

    let plugins = experimentInfo?.config?.plugins;

    return (
        <Sheet
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography level="h1">Export Model</Typography>
      <Sheet sx={{ overflowY: 'auto', overflowX: 'hidden', mb: '2rem' }}>
        <Divider sx={{ mt: 2, mb: 2 }} />
        <Typography level="title-lg" mb={2}>
          Available Export Formats&nbsp;
        </Typography>
        {plugins?.length === 0 ? (
          <Typography level="title-lg" mb={1} color="warning">
            No Export Formats available, please install an export plugin.
          </Typography>
        ) : (
            <Typography level="title-lg" mb={1} color="warning">
              Coming soon: You will be able to export models to MLX or GGUF!
            </Typography>
        )}
      </Sheet>
    </Sheet>
  );
  }