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

function ListOfWorkflowRuns({
  workflowRuns,
  isLoading,
  selectedWorkflowRun,
  setSelectedWorkflowRun,
}) {
  if (!workflowRuns || isLoading) {
    return <CircularProgress />;
  }

  if (workflowRuns.length === 0) {
    return <div>No workflow runs found.</div>;
  }

  return (
    <List sx={{ overflowY: 'auto', height: '100%' }}>
      {workflowRuns.map((run) => (
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

function ShowSelectedWorkflowRun({ selectedWorkflowRun, experimentInfo }) {
  const { data, error, isLoading, mutate } = useSWR(
    selectedWorkflowRun && experimentInfo?.id
      ? chatAPI.Endpoints.Workflows.GetRun(
          selectedWorkflowRun.id,
          experimentInfo.id,
        )
      : null,
    fetcher,
  );

  if (!selectedWorkflowRun || isLoading || !data) {
    return <div>No workflow run selected.</div>;
  }

  return (
    <Sheet variant="soft" sx={{ height: '100%', p: 2, overflowY: 'auto' }}>
      <WorkflowRunDisplay
        selectedWorkflowRun={data}
        experimentInfo={experimentInfo}
      />
    </Sheet>
  );
}

export default function WorkflowRuns({ experimentInfo }) {
  const [selectedWorkflowRun, setSelectedWorkflowRun] = useState(null);

  const { data, error, isLoading, mutate } = useSWR<WorkflowRun[]>(
    experimentInfo?.id
      ? chatAPI.Endpoints.Workflows.ListRunsInExperiment(experimentInfo.id)
      : null,
    fetcher,
    { refreshInterval: 2000 },
  );

  const workflowRuns = Array.isArray(data) ? data : [];

  useEffect(() => {
    if (!experimentInfo?.id) return;

    if (workflowRuns.length === 0) {
      setSelectedWorkflowRun(null);
    } else {
      setSelectedWorkflowRun(workflowRuns[0]);
    }
  }, [experimentInfo?.id, workflowRuns]);

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
          workflowRuns={workflowRuns}
          isLoading={isLoading}
          selectedWorkflowRun={selectedWorkflowRun}
          setSelectedWorkflowRun={setSelectedWorkflowRun}
        />
      </Box>
      <Box flex="3" sx={{}}>
        <ShowSelectedWorkflowRun
          selectedWorkflowRun={selectedWorkflowRun}
          experimentInfo={experimentInfo}
        />
      </Box>
    </Sheet>
  );
}
