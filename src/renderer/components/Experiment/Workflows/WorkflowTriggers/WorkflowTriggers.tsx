/* eslint-disable no-nested-ternary */
import {
  Box,
  CircularProgress,
  Sheet,
  Typography,
} from '@mui/joy';
import useSWR from 'swr';
import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import { Endpoints } from '../../../../lib/api-client/endpoints';
import WorkflowTriggerCard from './WorkflowTriggerCard';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function WorkflowTriggers({ experimentInfo }) {
  // Fetch workflow triggers for this experiment
  const { 
    data: triggers, 
    error: triggersError, 
    isLoading: isLoadingTriggers,
    mutate: mutateTriggers 
  } = useSWR(
    experimentInfo ? 
      Endpoints.WorkflowTriggers.ListByExperiment(experimentInfo.id) : 
      null, 
    fetcher
  );

  // Fetch available workflows for this experiment
  const { 
    data: workflows, 
    error: workflowsError, 
    isLoading: isLoadingWorkflows 
  } = useSWR(
    experimentInfo ? 
      Endpoints.Workflows.ListInExperiment(experimentInfo.id) : 
      null, 
    fetcher
  );

  // Handle updating a trigger
  const handleUpdateTrigger = async (triggerId, isEnabled, workflowIds) => {
    try {
      await chatAPI.updateWorkflowTrigger(triggerId, {
        is_enabled: isEnabled,
        config: { workflow_ids: workflowIds }
      });
      
      // Refresh the triggers list
      mutateTriggers();
    } catch (error) {
      console.error('Failed to update trigger:', error);
      // You could add a toast notification here
    }
  };

  // Loading state
  if (isLoadingTriggers || isLoadingWorkflows) {
    return (
      <Sheet sx={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Sheet>
    );
  }

  // Error state
  if (triggersError || workflowsError) {
    return (
      <Sheet sx={{ height: '100%', p: 2 }}>
        <Typography color="danger">
          Error loading workflow triggers or workflows. Please try again.
        </Typography>
      </Sheet>
    );
  }

  return (
    <Sheet sx={{ height: '100%', p: 2, overflow: 'auto' }}>
      <Typography level="h3" sx={{ mb: 3 }}>Workflow Triggers</Typography>
      
      {triggers && triggers.length > 0 ? (
        <Box>
          {triggers.map((trigger) => (
            <WorkflowTriggerCard
              key={trigger.id}
              trigger={trigger}
              availableWorkflows={workflows || []}
              onUpdateTrigger={handleUpdateTrigger}
            />
          ))}
        </Box>
      ) : (
        <Typography level="body-lg">
          No workflow triggers are available for this experiment.
        </Typography>
      )}
    </Sheet>
  );
}
