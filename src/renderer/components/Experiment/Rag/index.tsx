/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import { Box, Typography } from '@mui/joy';
import Documents from './Documents';
import Query from './Query';

export default function DocumentSearch({ experimentInfo }) {
  return (
    <>
      <Typography level="h1">Query Documents</Typography>

      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'row',
          height: '100%',
          width: '100%',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ flex: 3 }}>
          <Query experimentInfo={experimentInfo} />
        </Box>
        <Box
          sx={{
            flex: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Documents experimentInfo={experimentInfo} />
        </Box>
      </Sheet>
    </>
  );
}
