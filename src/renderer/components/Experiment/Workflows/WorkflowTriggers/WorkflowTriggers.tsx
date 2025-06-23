/* eslint-disable no-nested-ternary */
import {
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Sheet,
  Typography,
} from '@mui/joy';
import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { SquareArrowRightIcon, ZapIcon } from 'lucide-react';
import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import TriggerDisplay from './TriggerDisplay';

const fakeTrigger = {
  id: 'trigger-1',
  name: 'On Train Start',
  description: 'Trigger when the training starts',
  type: 'on_train_start',
  conditions: [
    { parameter: 'training-type', operator: 'equals', value: 'rag' },
    { parameter: 'training-tag', operator: 'includes', value: 'experiment-1' },
  ],
  created_at: '2023-10-01T00:00:00Z',
  updated_at: '2023-10-01T00:00:00Z',
  status: 'active',
  workflow_run_id: 'workflow-run-1',
  workflow_run_name: 'Workflow Run 1',
};

const fetcher = (url: any) => fetch(url).then((res) => res.json());

function ListOfTriggers({
  workflowRuns,
  isLoading,
  selectedWorkflowRun,
  setSelectedWorkflowRun,
}) {
  useEffect(() => {
    // if no workflow runs are selected, select the first one
    if (workflowRuns && workflowRuns.length > 0 && !selectedWorkflowRun) {
      setSelectedWorkflowRun(workflowRuns[0]);
    }
  }, [workflowRuns, selectedWorkflowRun, setSelectedWorkflowRun]);

  if (!workflowRuns || isLoading) {
    return <CircularProgress />;
  }

  if (workflowRuns.length === 0) {
    return <div>No workflow runs found.</div>;
  }

  return (
    <List sx={{ overflowY: 'auto', height: '100%' }}>
      <ListItem>
        <ListItemButton selected>
          <ListItemDecorator>
            <ZapIcon />
          </ListItemDecorator>
          <ListItemContent>
            <Typography level="title-lg">On Train Start</Typography>
          </ListItemContent>
        </ListItemButton>
      </ListItem>
      <ListItem>
        <ListItemButton>
          <ListItemDecorator>
            <ZapIcon />
          </ListItemDecorator>
          <ListItemContent>
            <Typography level="title-lg">On Train End</Typography>
          </ListItemContent>
        </ListItemButton>
      </ListItem>
    </List>
  );
}

function ShowSelectedTrigger({ selectedWorkflowRun }) {
  if (!selectedWorkflowRun) {
    return <div>No workflow run selected.</div>;
  }
  return (
    <Sheet variant="soft" sx={{ height: '100%', p: 2 }}>
      <pre>{JSON.stringify(fakeTrigger, null, 2)}</pre>
    </Sheet>
  );
}

export default function WorkflowTriggers({ experimentInfo }) {
  const [selectedTrigger, setSelectedTrigger] = useState(null);

  const { data, error, isLoading, mutate } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Workflows.ListRunsInExperiment(experimentInfo.id)
      : null,
    fetcher,
  );

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        overflow: 'hidden',
        gap: 2,
      }}
    >
      <Box flex="1" sx={{ minWidth: '200px' }}>
        <ListOfTriggers
          workflowRuns={data}
          isLoading={isLoading}
          selectedWorkflowRun={selectedTrigger}
          setSelectedWorkflowRun={setSelectedTrigger}
        />
      </Box>
      <Box flex="4">
        <TriggerDisplay />
      </Box>
    </Sheet>
  );
}
