import {
  Box,
  Switch,
  Typography,
  useColorScheme,
} from '@mui/joy';
import { TriggerBlueprint } from '../../../../types/workflow';

interface TriggerControlRowProps {
  triggerBlueprint: TriggerBlueprint;
  isEnabled: boolean;
  onToggleChange: (triggerType: string, newIsEnabledState: boolean) => void;
}

export default function TriggerControlRow({
  triggerBlueprint,
  isEnabled,
  onToggleChange,
}: TriggerControlRowProps) {
  const { mode } = useColorScheme();

  // Determine toggle color based on active state
  // Using 'success' color for enabled state in both light and dark modes
  // This provides consistent and clear visual feedback
  const toggleColor = isEnabled ? 'success' : 'neutral';

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        p: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': {
          borderBottom: 'none',
        },
        '&:hover': {
          bgcolor: 'background.level1',
        },
      }}
    >
      <Box sx={{ flex: 1, mr: 2 }}>
        <Typography 
          level="title-sm" 
          sx={{ 
            fontWeight: 'bold',
            mb: 0.5,
          }}
        >
          {triggerBlueprint.name}
        </Typography>
        <Typography 
          level="body-sm" 
          sx={{ 
            color: 'text.secondary',
            lineHeight: 1.4,
          }}
        >
          {triggerBlueprint.description}
        </Typography>
      </Box>
      <Switch
        checked={isEnabled}
        onChange={(event) => onToggleChange(triggerBlueprint.trigger_type, event.target.checked)}
        color={toggleColor}
      />
    </Box>
  );
} 