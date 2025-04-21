import {
  Typography,
  Box,
  Divider,
  Sheet,
  List,
  ListItem,
  ListItemContent,
  Switch,
  FormControl,
  FormLabel,
} from '@mui/joy';
import { InfoIcon, TagIcon, WorkflowIcon } from 'lucide-react';

const TriggerDisplay = () => {
  const triggerData = {
    id: 'trigger-1',
    name: 'On Train Start',
    description: 'Trigger when the training starts',
    type: 'on_train_start',
    conditions: [
      {
        parameter: 'training-type',
        operator: 'equals',
        value: 'rag',
      },
      {
        parameter: 'training-tag',
        operator: 'includes',
        value: 'experiment-1',
      },
    ],
    created_at: '2023-10-01T00:00:00Z',
    updated_at: '2023-10-01T00:00:00Z',
    status: 'active',
    workflow_run_id: 'workflow-run-1',
    workflow_run_name: 'Workflow Run 1',
  };

  // Format dates to be more readable
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Define status colors
  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'neutral';
      case 'error':
        return 'danger';
      default:
        return 'primary';
    }
  };

  return (
    <Sheet sx={{ p: 1, overflow: 'auto', height: '100%' }}>
      <Typography level="h3" sx={{ color: 'text.primary', mb: 2 }}>
        {triggerData.name}
      </Typography>
      <FormControl
        orientation="horizontal"
        sx={{ ml: 'auto', alignItems: 'center' }}
      >
        <FormLabel>Status:</FormLabel>
        <Switch
          checked={triggerData.status === 'active'}
          onChange={(event) => {
            const newStatus = event.target.checked ? 'active' : 'inactive';
            console.log(`Status changed to: ${newStatus}`);
            // Add logic to handle status change here
          }}
          color={getStatusColor(triggerData.status)}
        />
        <div style={{ marginLeft: '1rem' }}>Active</div>
      </FormControl>

      <Typography level="body-sm" sx={{ mb: 2, color: 'text.secondary' }}>
        {triggerData.description}
      </Typography>

      <Divider sx={{ my: 2 }} />

      <Typography
        level="title-md"
        startDecorator={<InfoIcon size={16} />}
        sx={{ mb: 1 }}
      >
        Trigger Details
      </Typography>
      <Sheet
        variant="soft"
        color="neutral"
        sx={{
          p: 2,
          borderRadius: 'md',
          mb: 2,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography level="body-xs">ID:</Typography>
          <Typography level="body-xs" fontFamily="monospace">
            {triggerData.id}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography level="body-xs">Type:</Typography>
          <Typography level="body-xs" fontFamily="monospace">
            {triggerData.type}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography level="body-xs">Created:</Typography>
          <Typography level="body-xs">
            {formatDate(triggerData.created_at)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography level="body-xs">Updated:</Typography>
          <Typography level="body-xs">
            {formatDate(triggerData.updated_at)}
          </Typography>
        </Box>
      </Sheet>

      <Typography
        level="title-md"
        startDecorator={<TagIcon size={16} />}
        sx={{ mb: 1 }}
      >
        Conditions
      </Typography>
      <List
        variant="outlined"
        sx={{
          borderRadius: 'md',
          mb: 2,
          '--ListItem-paddingY': '0.5rem',
        }}
      >
        {triggerData.conditions.map((condition, index) => (
          <ListItem key={index}>
            <ListItemContent>
              <pre>{JSON.stringify(condition, null, 2)}</pre>
            </ListItemContent>
          </ListItem>
        ))}
      </List>

      <Typography
        level="title-md"
        startDecorator={<WorkflowIcon size={16} />}
        sx={{ mb: 1 }}
      >
        Workflow
      </Typography>
      <Sheet
        variant="soft"
        color="primary"
        sx={{
          p: 2,
          borderRadius: 'md',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography level="body-xs">Run ID:</Typography>
          <Typography level="body-xs" fontFamily="monospace">
            {triggerData.workflow_run_id}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography level="body-xs">Run Name:</Typography>
          <Typography level="body-xs">
            {triggerData.workflow_run_name}
          </Typography>
        </Box>
      </Sheet>
    </Sheet>
  );
};

export default TriggerDisplay;
