/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import Sheet from '@mui/joy/Sheet';

import { Button, Stack, Typography } from '@mui/joy';
import { ExternalLinkIcon } from 'lucide-react';

export default function Api() {
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        paddingBottom: '20px',
      }}
    >
      <Stack direction="row" justifyContent="flex-start" spacing={2}>
        <div style={{}}>
          <Typography level="h1">API Documentation</Typography>
        </div>
        <Button
          onClick={() => {
            window.open(`${window.TransformerLab.API_URL}docs`);
          }}
          endDecorator={<ExternalLinkIcon />}
          variant="plain"
        >
          Open in{' '}
          {window?.platform?.appmode === 'cloud' ? 'New Tab' : 'Browser'}
        </Button>
      </Stack>
      <br />
      <iframe
        src={`${window.TransformerLab.API_URL}docs`}
        title="api docs"
        style={{
          border: '1px solid black',
          display: 'flex',
          flex: 99,
          height: '100%',
        }}
      />
    </Sheet>
  );
}
