import React from 'react';
import {
  Button,
  ButtonGroup,
  Dropdown,
  MenuButton,
  MenuItem,
  Menu,
  Typography,
  ListItemDecorator,
  Divider,
  Box,
} from '@mui/joy';
import { PlayIcon, ChevronDownIcon, ServerIcon } from 'lucide-react';
import { useAnalytics } from 'renderer/components/Shared/analytics/AnalyticsContext';
import { useAvailableMachines } from 'renderer/lib/useAvailableMachines';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface EvalRunButtonProps {
  evaluationId: string;
  pluginName: string;
  experimentId: number;
  onTaskQueued?: () => void;
}

export default function EvalRunButton({
  evaluationId,
  pluginName,
  experimentId,
  onTaskQueued,
}: EvalRunButtonProps) {
  const analytics: any = useAnalytics();
  const { availableMachines } = useAvailableMachines();

  const handleRunOnMachine = async (machineId: number) => {
    analytics.track('Task Queued Remote', {
      task_type: 'EVAL',
      plugin_name: pluginName,
      machine_id: 'local',
    });
    await fetch(chatAPI.Endpoints.Tasks.QueueRemote(evaluationId, machineId));
    onTaskQueued?.();
  };

  return availableMachines.length > 0 ? (
    <ButtonGroup variant="soft">
      {/* Main Run Button */}
      <Button
        startDecorator={<PlayIcon />}
        variant="soft"
        color="success"
        onClick={async () => {
          analytics.track('Task Queued', {
            task_type: 'EVAL',
            plugin_name: pluginName,
          });
          await fetch(chatAPI.Endpoints.Tasks.Queue(evaluationId));
          onTaskQueued?.();
        }}
        sx={{
          px: 2,
          py: 1,
          fontWeight: 'md',
          fontSize: 'sm',
          minHeight: '36px',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: 'lg',
          },
          '&:active': {
            transform: 'translateY(0px)',
          },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        Queue
      </Button>

      {/* Dropdown Button */}
      <Dropdown>
        <MenuButton
          slots={{ root: Button }}
          slotProps={{
            root: {
              variant: 'soft',
              color: 'success',
              sx: {
                px: 1,
                py: 1,
                minWidth: '32px',
                width: '32px',
                minHeight: '36px',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: 'lg',
                },
                '&:active': {
                  transform: 'translateY(0px)',
                },
                transition: 'all 0.2s ease-in-out',
              },
              'aria-label': 'Select machine to run on',
            },
          }}
        >
          <ChevronDownIcon size="12px" />
        </MenuButton>
        <Menu
          placement="bottom-end"
          sx={{
            mt: 0.5,
            minWidth: '240px',
            boxShadow: 'xl',
            border: '1px solid',
            borderColor: 'neutral.200',
            borderRadius: 'lg',
            p: 1,
          }}
        >
          <Box sx={{ px: 1, py: 0.5 }}>
            <Typography
              level="body-xs"
              sx={{
                color: 'neutral.600',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                letterSpacing: '0.05em',
                mb: 1,
              }}
            >
              🖥️ Run on Remote Machine
            </Typography>
            <Divider sx={{ my: 1 }} />
            {availableMachines.map((machine) => (
              <MenuItem
                key={machine.id}
                onClick={() => handleRunOnMachine(machine.id)}
                sx={{
                  borderRadius: 'md',
                  my: 0.5,
                  px: 2,
                  py: 1.5,
                  background: 'transparent',
                  '&:hover': {
                    backgroundColor: 'success.50',
                    transform: 'translateX(4px)',
                    boxShadow: 'sm',
                  },
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                }}
              >
                <ListItemDecorator>
                  <Box
                    sx={{
                      p: 0.5,
                      borderRadius: 'sm',
                      backgroundColor: 'success.100',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ServerIcon
                      size="16px"
                      color="var(--joy-palette-success-600)"
                    />
                  </Box>
                </ListItemDecorator>
                <Box sx={{ ml: 1 }}>
                  <Typography
                    level="body-sm"
                    fontWeight="600"
                    sx={{ color: 'neutral.800' }}
                  >
                    {machine.name}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                    Machine ID: {machine.id}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Box>
        </Menu>
      </Dropdown>
    </ButtonGroup>
  ) : (
    /* Single symmetric button when no machines available */
    <Button
      startDecorator={<PlayIcon />}
      variant="soft"
      color="success"
      onClick={async () => {
        analytics.track('Task Queued', {
          task_type: 'EVAL',
          plugin_name: pluginName,
          experiment_id: experimentId,
        });
        await fetch(chatAPI.Endpoints.Tasks.Queue(evaluationId));
        onTaskQueued?.();
      }}
      sx={{
        px: 3,
        py: 1,
        fontWeight: 'md',
        fontSize: 'sm',
        minHeight: '36px',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: 'lg',
        },
        '&:active': {
          transform: 'translateY(0px)',
        },
        transition: 'all 0.2s ease-in-out',
      }}
    >
      Queue
    </Button>
  );
}
