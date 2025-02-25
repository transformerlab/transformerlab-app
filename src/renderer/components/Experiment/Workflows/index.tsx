import {
  Box,
  Button,
  ButtonGroup,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Sheet,
  Table,
  Typography,
} from '@mui/joy';
import { Background, ControlButton, Controls, ReactFlow } from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { WorkflowIcon } from 'lucide-react';

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
        mb: 3,
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
        <Box flex={1}>
          <Typography level="title-lg" mb={2}>
            Workflows
          </Typography>
          <List>
            {[1, 2, 3].map((i) => (
              <ListItem key={i}>
                <ListItemButton>
                  <ListItemDecorator>
                    <WorkflowIcon />
                  </ListItemDecorator>
                  <ListItemContent>Workflow {i}</ListItemContent>
                  &rarr;
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
        <Box flex={3} display="flex" flexDirection="column">
          <Typography level="title-lg" mb={2}>
            Workflow 1
          </Typography>
          <Box
            sx={{
              display: 'flex',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              flexDirection: 'row',
            }}
          >
            <ReactFlow
              nodes={initialNodes}
              edges={initialEdges}
              fitView
              style={{ backgroundColor: '#F7F9FB' }}
            >
              <Background color="#96ADE9" />
              <Controls>
                <ControlButton
                  onClick={() => {
                    alert('hi');
                  }}
                >
                  a
                </ControlButton>
              </Controls>
            </ReactFlow>
            <Box pl={2} display="flex" flexDirection="column" gap={1}>
              <Button>Edit</Button>
              <Button>Run</Button>
              <Button>Fight</Button>
            </Box>
          </Box>
        </Box>
      </Sheet>
    </Sheet>
  );
}
