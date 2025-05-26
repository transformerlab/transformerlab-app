import {
  Box,
  Card,
  FormControl,
  FormLabel,
  Option,
  Select,
  Switch,
  Typography,
  useColorScheme,
} from '@mui/joy';

interface WorkflowTriggerCardProps {
  trigger: {
    id: string;
    name: string;
    description?: string;
    is_enabled: boolean;
    config: {
      workflow_ids: number[];
    };
  };
  availableWorkflows: {
    id: number;
    name: string;
  }[];
  onUpdateTrigger: (
    triggerId: string,
    isEnabled: boolean,
    workflowIds: number[]
  ) => void;
}

export default function WorkflowTriggerCard({
  trigger,
  availableWorkflows,
  onUpdateTrigger,
}: WorkflowTriggerCardProps) {
  const { mode } = useColorScheme();
  
  // Handle the case where workflow_ids might be undefined
  const workflowIds = trigger.config?.workflow_ids || [];

  // Get the names of selected workflows for display
  const selectedWorkflowNames = availableWorkflows
    .filter((workflow) => workflowIds.includes(workflow.id))
    .map((workflow) => workflow.name);

  // Determine toggle color based on active state and color mode
  const toggleColor = trigger.is_enabled 
    ? (mode === 'dark' ? 'success' : 'primary') 
    : undefined;

  return (
    <Card 
      sx={{ 
        p: 2, 
        mb: 2, 
        borderRadius: 'md',
        width: 'calc(50% - 8px)', // Set width to 50% minus half the gap
        display: 'inline-block',
        verticalAlign: 'top',
        mr: 2, // Add margin-right for gap between cards
        '&:nth-of-type(2n)': {
          mr: 0, // Remove margin-right for every second card
        }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, gap: 3 }}>
        <Box sx={{ 
          flex: 1, 
          minWidth: 0,
          maxWidth: '75%' // Limit the width of the text container
        }}>
          <Typography 
            level="title-lg" 
            sx={{ 
              wordWrap: 'break-word',
              pr: 3, // Increased padding-right from 2 to 3
              maxWidth: '100%'
            }}
          >
            {trigger.name}
          </Typography>
          <Typography 
            level="body-md" 
            sx={{ 
              mb: 2, 
              color: 'text.secondary',
              wordWrap: 'break-word',
              maxWidth: '100%'
            }}
          >
            {trigger.description || "Workflows will automatically start after every training job is completed."}
          </Typography>
        </Box>
        <FormControl 
          orientation="horizontal" 
          sx={{ 
            alignItems: 'center', 
            flexShrink: 0,
            pl: 1 // Added left padding to the toggle area
          }}
        >
          <Typography level="body-md" sx={{ mr: 1, fontWeight: 'bold' }}>
            {trigger.is_enabled ? 'Active' : 'Inactive'}
          </Typography>
          <Switch
            checked={trigger.is_enabled}
            onChange={(event) =>
              onUpdateTrigger(
                trigger.id,
                event.target.checked,
                workflowIds
              )
            }
            color={toggleColor}
            sx={{
              '--Switch-trackWidth': '40px',
              '--Switch-trackHeight': '24px',
              '--Switch-thumbSize': '18px',
              '&.Mui-checked': {
                '--Switch-trackBackground': mode === 'dark' ? 'var(--joy-palette-success-solidBg)' : 'var(--joy-palette-primary-solidBg)',
                '--Switch-thumbColor': '#fff',
              },
            }}
          />
        </FormControl>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography level="title-sm" sx={{ fontWeight: 'bold', mb: 1, color: 'text.primary' }}>
          Assign Workflows to Start
        </Typography>
        <Box 
          sx={{ 
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 'sm',
            bgcolor: 'transparent',
            '&:hover': {
              bgcolor: 'background.level1',
            },
          }}
        >
          <Select
            multiple
            value={workflowIds}
            onChange={(_, newValue) =>
              onUpdateTrigger(
                trigger.id,
                trigger.is_enabled,
                newValue as number[]
              )
            }
            placeholder="Select workflows..."
            renderValue={() => {
              return selectedWorkflowNames.length > 0 
                ? selectedWorkflowNames.join(', ')
                : 'No workflows selected';
            }}
            slotProps={{
              listbox: {
                sx: { maxHeight: '400px', overflow: 'auto' },
              },
              root: {
                sx: {
                  width: '100%',
                  minHeight: '44px',
                },
              },
            }}
            sx={{
              width: '100%',
              fontSize: '0.875rem',
              minHeight: '44px',
              border: 'none',
              '--Select-decoratorChildHeight': '24px',
              backgroundColor: 'transparent',
              '&:hover': {
                backgroundColor: 'transparent',
              },
              '& .MuiSelect-indicator': {
                color: 'text.tertiary',
              },
            }}
            variant="plain"
          >
            {availableWorkflows.map((workflow) => (
              <Option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </Option>
            ))}
          </Select>
        </Box>
      </Box>
    </Card>
  );
} 