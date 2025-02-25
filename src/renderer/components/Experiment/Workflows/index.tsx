import { Box, Button, ButtonGroup, Sheet, Table, Typography } from '@mui/joy';
import { ReactFlow } from '@xyflow/react';

import '@xyflow/react/dist/style.css';

const initialNodes = [
  {
    id: '1',
    position: { x: 0, y: 0 },
    data: { label: '1. Generate Synthetic Training Data' },
  },
  {
    id: '2',
    position: { x: 0, y: 100 },
    data: { label: '2. Evaluate' },
  },
  {
    id: '3',
    position: { x: 0, y: 200 },
    data: { label: '3. Train on Documents' },
  },
  {
    id: '4',
    position: { x: 0, y: 300 },
    data: { label: '4. Evaluate' },
  },
];
const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
  { id: 'e3-4', source: '3', target: '4' },
];

export default function Workflows({ experimentInfo }) {
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        pb: 2,
      }}
    >
      <Typography level="h1">Workflows</Typography>
      <Typography level="body-lg" mb={3}>
        This is where it will all go
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
        <Box flex={2}>
          <Typography level="title-lg" mb={2}>
            List
          </Typography>
          <Table>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Status</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i}>
                  <td>Workflow {i}</td>
                  <td>Running</td>
                  <td>
                    <ButtonGroup>
                      <Button>Edit</Button>
                      <Button>View</Button>
                    </ButtonGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>
        <Box flex={2}>
          <Typography level="title-lg" mb={2}>
            Preview
          </Typography>
          <ReactFlow nodes={initialNodes} edges={initialEdges} />
        </Box>
      </Sheet>
    </Sheet>
  );
}
