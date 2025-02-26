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
import { PlayIcon, PlusCircleIcon, WorkflowIcon } from 'lucide-react';
import { useState } from 'react';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
import NewWorkflowModal from './NewWorkflowModal';

const fetcher = (url: any) => fetch(url).then((res) => res.json());

export default function Workflows({ experimentInfo }) {
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [newWorkflowModalOpen, setNewWorkflowModalOpen] = useState(false);
  const {
    data: workflowsData,
    error: workflowsError,
    isLoading: isLoading,
    mutate: mutateWorkflows,
  } = useSWR(chatAPI.Endpoints.Workflows.List(), fetcher);

  const workflows = workflowsData;

  function generateNodes(workflow: any) {
    let out: any[] = [];
    let currentTask = '0';
    let position = 0;

    const workflowConfig = JSON.parse(workflow?.config);
    console.log(workflowConfig);

    while (currentTask < workflowConfig.nodes.length) {
      out.push({
        id: currentTask,
        position: { x: 0, y: position },
        data: { label: workflowConfig.nodes[currentTask].name },
      });
      position += 100;
      currentTask = workflowConfig.nodes[currentTask].out;
    }

    return out;
  }

  function generateEdges(workflow: any) {
    let out: any[] = [];
    let currentTask = '0';
    let ids = '0';

    const workflowConfig = JSON.parse(workflow?.config);
    console.log(workflowConfig);

    while (currentTask < workflowConfig.nodes.length) {
      out.push({
        id: ids,
        source: currentTask,
        target: workflowConfig.nodes[currentTask].out,
        markerEnd: {
          type: 'arrow',
        },
      });
      ids += 1;
      currentTask = workflowConfig.nodes[currentTask].out;
    }

    return out;
  }

  async function runWorkflow(workflowId: string) {
    await fetch(chatAPI.Endpoints.Workflows.RunWorkflow(workflowId));
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
      <NewWorkflowModal
        open={newWorkflowModalOpen}
        onClose={() => {
          setNewWorkflowModalOpen(false);
          mutateWorkflows();
        }}
        experimentId={experimentInfo?.id}
      />
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
            {workflows &&
              workflows?.length > 0 &&
              workflows?.map((workflow) => (
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
            <ListItem>
              <ListItemButton onClick={() => setNewWorkflowModalOpen(true)}>
                <ListItemDecorator>
                  <PlusCircleIcon />
                </ListItemDecorator>
                <ListItemContent>New Workflow</ListItemContent>
              </ListItemButton>
            </ListItem>
          </List>
        </Box>

        <Box flex={3} display="flex" flexDirection="column">
          <Typography level="title-lg" mb={2}>
            Workflow {selectedWorkflow?.name}
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
            {selectedWorkflow ? (
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
                    *
                  </ControlButton>
                </Controls>
              </ReactFlow>
            ) : (
              <Box sx={{ width: '100%', backgroundColor: '#F7F9FB' }} p={4}>
                Select Workflow
              </Box>
            )}
            {selectedWorkflow && (
              <Box pl={2} display="flex" flexDirection="column" gap={1}>
                {selectedWorkflow.status != 'RUNNING' ? (
                  <Button
                    startDecorator={<PlayIcon />}
                    onClick={() => runWorkflow(selectedWorkflow.id)}
                  >
                    Run
                  </Button>
                ) : (
                  <Button startDecorator={<PlayIcon />} disabled={true}>
                    Running
                  </Button>
                )}
                <Button variant="outlined">Edit</Button>
                <Button variant="outlined">Fight</Button>
              </Box>
            )}
          </Box>
        </Box>
      </Sheet>
    </Sheet>
  );
}
