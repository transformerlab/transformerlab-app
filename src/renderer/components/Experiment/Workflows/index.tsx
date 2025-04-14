/* eslint-disable no-nested-ternary */
import { Sheet, Typography } from '@mui/joy';

import '@xyflow/react/dist/style.css';

import WorkflowList from './WorkflowList';

export default function Workflows({ experimentInfo }) {
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        mb: 3,
      }}
    >
      <Typography level="h1" mb={1}>
        Workflows
      </Typography>
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 2,
          width: '100%',
          height: '100%',
        }}
      >
        <WorkflowList experimentInfo={experimentInfo} />
      </Sheet>
    </Sheet>
  );
}
