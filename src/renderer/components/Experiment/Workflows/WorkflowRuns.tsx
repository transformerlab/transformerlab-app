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
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

const fetcher = (url: any) => fetch(url).then((res) => res.json());

function ListOfWorkflowRuns({
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
      {/* <pre>{JSON.stringify(workflowRuns, null, 2)}</pre> */}
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
                <TinyCircle color="green" />
              ) : (
                <TinyCircle color="grey" />
              )}
            </ListItemDecorator>
            <ListItemContent>
              <Typography level="title-lg">{run?.id}</Typography>
            </ListItemContent>
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

function ShowSelectedWorkflowRun({ selectedWorkflowRun }) {
  if (!selectedWorkflowRun) {
    return <div>No workflow run selected.</div>;
  }
  return (
    <Sheet variant="soft" sx={{ height: '100%', p: 2 }}>
      <pre>{JSON.stringify(selectedWorkflowRun, null, 2)}</pre>
    </Sheet>
  );
}

export default function WorkflowRuns({ experimentInfo }) {
  const [selectedWorkflowRun, setSelectedWorkflowRun] = useState(null);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Workflows.ListRuns(),
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
        <ListOfWorkflowRuns
          workflowRuns={data}
          isLoading={isLoading}
          selectedWorkflowRun={selectedWorkflowRun}
          setSelectedWorkflowRun={setSelectedWorkflowRun}
        />
      </Box>
      <Box flex="3">
        <ShowSelectedWorkflowRun selectedWorkflowRun={selectedWorkflowRun} />
      </Box>
    </Sheet>
  );
}
