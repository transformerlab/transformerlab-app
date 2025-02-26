import {
  Box,
  Button,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Sheet,
  Typography,
} from '@mui/joy';

import '@xyflow/react/dist/style.css';
import {
  AxeIcon,
  PencilIcon,
  PenIcon,
  PlayIcon,
  PlusCircleIcon,
  PlusIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useState } from 'react';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
import NewWorkflowModal from './NewWorkflowModal';
import NewNodeModal from './NewNodeModal';
import WorkflowCanvas from './WorkflowCanvas';

const fetcher = (url: any) => fetch(url).then((res) => res.json());

export default function Workflows({ experimentInfo }) {
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [newWorkflowModalOpen, setNewWorkflowModalOpen] = useState(false);
  const [newNodeflowModalOpen, setNewNodeflowModalOpen] = useState(false);

  const {
    data: workflowsData,
    error: workflowsError,
    isLoading: isLoading,
    mutate: mutateWorkflows,
  } = useSWR(chatAPI.Endpoints.Workflows.List(), fetcher);

  const workflows = workflowsData;

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
      {selectedWorkflow && (
        <NewNodeModal
          open={newNodeflowModalOpen}
          onClose={() => {
            setNewNodeflowModalOpen(false);
            mutateWorkflows();
          }}
          selectedWorkflow={selectedWorkflow}
        />
      )}
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
            <Divider />
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
              <WorkflowCanvas selectedWorkflow={selectedWorkflow} />
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
                <Button
                  startDecorator={<PlusIcon />}
                  onClick={() => setNewNodeflowModalOpen(true)}
                >
                  Add Node
                </Button>
                <Button startDecorator={<PenIcon />} variant="outlined">
                  Edit
                </Button>
                <Button startDecorator={<AxeIcon />} variant="outlined">
                  Fight
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Sheet>
    </Sheet>
  );
}
