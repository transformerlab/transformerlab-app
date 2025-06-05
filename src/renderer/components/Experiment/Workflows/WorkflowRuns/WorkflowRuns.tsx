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
import TinyCircle from 'renderer/components/Shared/TinyCircle';
import { useEffect, useState } from 'react';
import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import WorkflowRunDisplay from './WorkflowRunDisplay';

const fetcher = (url: any) => fetch(url).then((res) => res.json());

interface WorkflowRun {
  id: string;
  status: string;
  workflow_name: string;
}

function ListOfWorkflowRuns({
  workflowRuns,
  isLoading,
  selectedWorkflowRun,
  setSelectedWorkflowRun,
}: {
  workflowRuns: WorkflowRun[] | undefined;
  isLoading: boolean;
  selectedWorkflowRun: WorkflowRun | null;
  setSelectedWorkflowRun: (run: WorkflowRun | null) => void;
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
      {/* <pre>{JSON.stringify(workflowRuns, null, 2)}</pre> */}
      {workflowRuns.map((run: WorkflowRun) => (
        <ListItem key={run.id}>
          <ListItemButton
            selected={run.id === selectedWorkflowRun?.id}
            onClick={() => {
              setSelectedWorkflowRun(run);
            }}
          >
            <ListItemDecorator>
              {run?.status === 'RUNNING' ? (
                <CircularProgress
                  variant="soft"
                  sx={{
                    '--CircularProgress-trackThickness': '2px',
                    '--CircularProgress-progressThickness': '2px',
                    '--CircularProgress-size': '12px',
                  }}
                />
              ) : (
                <TinyCircle color="grey" />
              )}
            </ListItemDecorator>
            <ListItemContent>
              <Typography level="title-lg">
                {run?.id} - {run?.workflow_name}
              </Typography>
            </ListItemContent>
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

function ShowSelectedWorkflowRun({ selectedWorkflowRun }: { selectedWorkflowRun: WorkflowRun | null }) {
  if (!selectedWorkflowRun) {
    return <div>No workflow run selected.</div>;
  }

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Workflows.GetRun(selectedWorkflowRun.id),
    fetcher,
  );
  return (
    <Sheet variant="soft" sx={{ height: '100%', p: 2, overflowY: 'auto' }}>
      <WorkflowRunDisplay selectedWorkflowRun={data} />
    </Sheet>
  );
}

export default function WorkflowRuns({ experimentInfo }: { experimentInfo: { id: string } }) {
  const [selectedWorkflowRun, setSelectedWorkflowRun] = useState<WorkflowRun | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    experimentInfo?.id ? chatAPI.Endpoints.Workflows.ListRunsInExperiment(experimentInfo.id) : null,
    fetcher,
    { refreshInterval: 2000 },
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
        <ListOfWorkflowRuns
          workflowRuns={data}
          isLoading={isLoading}
          selectedWorkflowRun={selectedWorkflowRun}
          setSelectedWorkflowRun={setSelectedWorkflowRun}
        />
      </Box>
      <Box flex="3" sx={{}}>
        <ShowSelectedWorkflowRun selectedWorkflowRun={selectedWorkflowRun} />
      </Box>
    </Sheet>
  );
}
