import {
  Box,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Sheet,
  Typography,
} from '@mui/joy';
import { Background, ControlButton, Controls, ReactFlow } from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { PlayIcon, WorkflowIcon } from 'lucide-react';
import { useState } from 'react';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';

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
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    markerEnd: { type: 'arrow' },
  },
  {
    id: 'e2-3',
    source: '2',
    target: '3',
    markerEnd: { type: 'arrow' },
  },
  {
    id: 'e3-4',
    source: '3',
    target: '4',
    markerEnd: {
      type: 'arrow',
    },
  },
];

const fetcher = (url : any) => fetch(url).then((res) => res.json());

export default function Workflows({ experimentInfo }) {
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

  const {
    data: workflowsData,
    error: workflowsError,
    isLoading: isLoading,
  } = useSWR(chatAPI.Endpoints.Workflows.List(), fetcher);

  const workflows = workflowsData;

  function generateNodes(workflow: any){
    let out : any[] = [];
    let currentTask = "0";
    let position = 0;

    const workflowConfig = JSON.parse(workflow.config);
    console.log(workflowConfig);

    while (currentTask<workflowConfig.nodes.length) {
      out.push({
        id: currentTask,
        position: { x: 0, y: position },
        data: { label: workflowConfig.nodes[currentTask].name },
      })
      position += 100;
      currentTask = workflowConfig.nodes[currentTask].out;
    }

    return out;
  }

  function generateEdges(workflow: any){
    let out : any[] = [];
    let currentTask = "0";
    let ids = "0";

    const workflowConfig = JSON.parse(workflow.config);
    console.log(workflowConfig);

    while (currentTask<workflowConfig.nodes.length) {

      out.push({
        id: ids,
        source: currentTask,
        target: workflowConfig.nodes[currentTask].out,
        markerEnd: {
          type: 'arrow',
        },
      })
      ids += 1;
      currentTask = workflowConfig.nodes[currentTask].out;
    }

    return out;
  }

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
          {workflows &&
          <List>
            {workflows.map((workflow) => (
              <ListItem key={workflow.id}>
                <ListItemButton onClick={() => setSelectedWorkflow(workflow)}>
                  <ListItemDecorator>
                    <WorkflowIcon />
                  </ListItemDecorator>
                  <ListItemContent>{workflow.name}</ListItemContent>
                  &rarr;
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          }
        </Box>

        {selectedWorkflow &&
        <Box flex={3} display="flex" flexDirection="column">
          <Typography level="title-lg" mb={2}>
            Workflow {selectedWorkflow.name}
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
              nodes={generateNodes(selectedWorkflow)}
              edges={generateEdges(selectedWorkflow)}
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
              <Button startDecorator={<PlayIcon />}>Run</Button>
              <Button variant="outlined">Edit</Button>
              <Button variant="outlined">Fight</Button>
            </Box>
          </Box>
        </Box>}
      </Sheet>
    </Sheet>
  );
}
