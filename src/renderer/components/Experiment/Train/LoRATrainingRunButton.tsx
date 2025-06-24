/* eslint-disable jsx-a11y/anchor-is-valid */
import React from 'react';
import {
  Button,
  Menu,
  MenuItem,
  Dropdown,
  ButtonGroup,
  ListItemDecorator,
  Typography,
  Divider,
  Box,
  MenuButton,
} from '@mui/joy';
import { PlayIcon, ChevronDownIcon, ServerIcon } from 'lucide-react';
import { useAnalytics } from 'renderer/components/Shared/analytics/AnalyticsContext';
import { useAvailableMachines } from 'renderer/lib/useAvailableMachines';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

interface LoRATrainingRunButtonProps {
  initialMessage: string;
  trainingTemplate: any;
  experimentId: number;
  onTaskQueued?: () => void;
}

export default function LoRATrainingRunButton({
  initialMessage,
  trainingTemplate,
  experimentId,
  onTaskQueued,
}: LoRATrainingRunButtonProps) {
  const analytics: any = useAnalytics();
  const { availableMachines } = useAvailableMachines();

  // The name of the training template is stored in an unparsed JSON string
  // in the `config` field of the training template.
  const jobData = trainingTemplate;
  let jobConfig = jobData?.config;
  let pluginName = '';
  if (jobConfig) {
    try {
      jobConfig = JSON.parse(jobConfig);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse jobConfig:', e);
      jobConfig = {};
    }
    pluginName = jobConfig?.plugin_name || '';
  }

  const handleRunOnMachine = async (machineId: number) => {
    analytics.track('Task Queued Remote', {
      task_type: 'TRAIN',
      plugin_name: pluginName,
      machine_id: machineId,
      experiment_id: experimentId,
    });
    await fetch(
      chatAPI.Endpoints.Tasks.QueueRemote(
        trainingTemplate.template_id,
        machineId,
      ),
    );
    onTaskQueued?.();
  };

  return availableMachines.length > 0 ? (
    <ButtonGroup
      variant="solid"
      sx={{
        boxShadow: 'md',
        borderRadius: 'md',
        '& > button:first-of-type': {
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        },
        '& > div > button': {
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: '1px solid rgba(255,255,255,0.15)',
        },
      }}
    >
      {/* Main Run Button */}
      <Button
        color="primary"
        endDecorator={<PlayIcon size="14px" />}
        onClick={async () => {
          analytics.track('Task Queued', {
            task_type: 'TRAIN',
            plugin_name: pluginName,
            experiment_id: experimentId,
          });
          await fetch(
            chatAPI.Endpoints.Tasks.Queue(trainingTemplate.template_id),
          );
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
        {initialMessage}
      </Button>

      {/* Dropdown Button */}
      <Dropdown>
        <MenuButton
          slots={{ root: Button }}
          slotProps={{
            root: {
              color: 'primary',
              variant: 'solid',
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
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
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
                    backgroundColor: 'primary.50',
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
                      backgroundColor: 'primary.100',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ServerIcon
                      size="16px"
                      color="var(--joy-palette-primary-600)"
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
      color="primary"
      variant="solid"
      endDecorator={<PlayIcon size="14px" />}
      onClick={async () => {
        analytics.track('Task Queued', {
          task_type: 'TRAIN',
          plugin_name: pluginName,
          experiment_id: experimentId,
        });
        await fetch(
          chatAPI.Endpoints.Tasks.Queue(trainingTemplate.template_id),
        );
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
      {initialMessage}
    </Button>
  );
}

// Ensure chatAPI.Endpoints.Tasks.QueueRemote exists:
// chatAPI.Endpoints.Tasks.QueueRemote = (taskId: number, machineId: number) => `/api/tasks/${taskId}/queue/${machineId}`;
