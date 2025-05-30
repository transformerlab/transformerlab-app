import {
  Box,
  Card,
  CircularProgress,
  Typography,
  Alert,
} from '@mui/joy';
import { useState } from 'react';
import TriggerControlRow from './TriggerControlRow';
import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import { TriggerConfig, TriggerBlueprint } from '../../../../types/workflow';

interface WorkflowTriggersMenuProps {
  workflowId: string;
  currentTriggerConfigs: TriggerConfig[];
  predefinedTriggers: TriggerBlueprint[] | null;
  onConfigurationChange: (newConfigs: TriggerConfig[]) => void;
}

export default function WorkflowTriggersMenu({
  workflowId,
  currentTriggerConfigs,
  predefinedTriggers,
  onConfigurationChange,
}: WorkflowTriggersMenuProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [optimisticConfigs, setOptimisticConfigs] = useState<TriggerConfig[] | null>(null);

  // Debug logging
  console.log('WorkflowTriggersMenu received:', {
    predefinedTriggers,
    currentTriggerConfigs,
    workflowId
  });

  // Ensure predefinedTriggers is an array and handle null/undefined cases
  const safePredefinedTriggers = Array.isArray(predefinedTriggers) ? predefinedTriggers : [];
  console.log('Safe predefined triggers:', safePredefinedTriggers);

  // Initialize configs if empty (for workflows that don't have trigger_configs yet)
  const initializedConfigs = currentTriggerConfigs?.length > 0 
    ? currentTriggerConfigs 
    : safePredefinedTriggers.map(trigger => ({ trigger_type: trigger.trigger_type, is_enabled: false }));

  // Use optimistic configs if available, otherwise use initialized configs
  const displayConfigs = optimisticConfigs || initializedConfigs || [];

  const handleToggleChange = async (triggerType: string, newIsEnabledState: boolean) => {
    // Create optimistic update
    const newConfigs = displayConfigs.map(config => 
      config.trigger_type === triggerType 
        ? { ...config, is_enabled: newIsEnabledState }
        : config
    );
    
    setOptimisticConfigs(newConfigs);
    setIsLoading(true);
    setError(null);

    try {
      // Make API call with full configs array
      const result = await chatAPI.updateWorkflowTriggerConfigs(workflowId, newConfigs);
      
      // On success, clear optimistic state and update parent
      setOptimisticConfigs(null);
      onConfigurationChange(result.trigger_configs || newConfigs);
    } catch (err) {
      // On error, revert optimistic update and show error
      setOptimisticConfigs(null);
      setError('Failed to update triggers. Please try again.');
      console.error('Failed to update workflow triggers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card
      sx={{
        position: 'absolute',
        top: '100%',
        right: 0,
        mt: 1,
        minWidth: '320px',
        width: '440px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '400px',
        overflow: 'hidden',
        zIndex: 1000,
        boxShadow: 'lg',
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: (theme) => 
            theme.palette.mode === 'dark' 
              ? 'var(--joy-palette-neutral-400)' 
              : 'var(--joy-palette-neutral-300)',
          borderRadius: '4px',
        },
      }}
    >
      <Box sx={{px: 2, pt: 1.5, pb: 1}}>
        <Typography level="title-md" sx={{ fontWeight: 'bold' }}>
          Workflow Triggers
        </Typography>
        <Typography level="body-sm" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Configure when this workflow should automatically start
        </Typography>
      </Box>

      {error && (
        <Alert color="danger" sx={{ mx: 2, mt: 0.5, mb: 0 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ 
        overflow: 'auto', 
        maxHeight: '300px',
        position: 'relative',
        pt: 0,
        mt: error ? 0.5 : 0,
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: (theme) => 
            theme.palette.mode === 'dark' 
              ? 'var(--joy-palette-neutral-400)' 
              : 'var(--joy-palette-neutral-300)',
          borderRadius: '4px',
        },
      }}>
        {isLoading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'background.surface',
              opacity: 0.7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <CircularProgress size="sm" />
          </Box>
        )}
        
        {safePredefinedTriggers.length > 0 ? (
          safePredefinedTriggers.map((triggerBlueprint, index) => {
            const config = displayConfigs.find(c => c.trigger_type === triggerBlueprint.trigger_type);
            const isEnabled = config?.is_enabled || false;

            return (
              <Box
                key={triggerBlueprint.trigger_type}
                sx={{
                  borderTop: '1px solid',
                  borderColor: 'neutral.outlinedBorder',
                  minWidth: '100%',
                }}
              >
                <TriggerControlRow
                  triggerBlueprint={triggerBlueprint}
                  isEnabled={isEnabled}
                  onToggleChange={handleToggleChange}
                />
              </Box>
            );
          })
        ) : (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              {predefinedTriggers === null ? 'Loading triggers...' : 'No triggers available'}
            </Typography>
          </Box>
        )}
      </Box>
    </Card>
  );
} 