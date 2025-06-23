/* eslint-disable jsx-a11y/anchor-is-valid */
import React, { useState } from 'react';
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
  Modal,
  ModalDialog,
  ModalClose,
  Stack,
} from '@mui/joy';
import { PlayIcon, ChevronDownIcon, ServerIcon, Users } from 'lucide-react';
import { useAnalytics } from 'renderer/components/Shared/analytics/AnalyticsContext';
import { DistributedTrainingConfig } from 'renderer/types/distributed';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import DistributedTrainingSettings from './DistributedTrainingSettings';

interface Machine {
  id: number;
  name: string;
}

interface LoRATrainingRunButtonProps {
  initialMessage: string;
  trainingTemplate: any;
  experimentId: number;
  machines?: Machine[];
  onTaskQueued?: () => void;
}

export default function LoRATrainingRunButton({
  initialMessage,
  trainingTemplate,
  experimentId,
  machines = [],
  onTaskQueued,
}: LoRATrainingRunButtonProps) {
  const [distributedModalOpen, setDistributedModalOpen] = useState(false);
  const [distributedEnabled, setDistributedEnabled] = useState(false);
  const [distributedConfig, setDistributedConfig] =
    useState<DistributedTrainingConfig>({
      plugin_name: '',
      config: {},
      resource_requirements: {
        num_machines: 1,
        gpus_per_machine: undefined,
        min_gpu_memory: undefined,
      },
      machine_selection: 'auto',
      selected_machines: [],
    });

  const analytics: any = useAnalytics();

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

  const getSelectedMachines = () => {
    if (
      distributedConfig.machine_selection === 'manual' &&
      distributedConfig.selected_machines
    ) {
      return distributedConfig.selected_machines;
    }
    // Auto mode: return machine IDs based on num_machines
    const availableMachines = machines || [];
    return availableMachines
      .slice(0, distributedConfig.resource_requirements.num_machines)
      .map((m) => m.id);
  };

  const handleDistributedTraining = async () => {
    if (!distributedEnabled) {
      setDistributedModalOpen(true);
      return;
    }

    try {
      // Validate minimum requirements
      const selectedMachines = getSelectedMachines();
      if (selectedMachines.length < 1) {
        // eslint-disable-next-line no-alert
        alert(
          'Distributed training requires at least 1 machine. Please select a machine.',
        );
        return;
      }

      // Plan distributed job
      const planRequest = {
        required_gpus:
          distributedConfig.resource_requirements.gpus_per_machine || 1,
        model_size_gb: 1.0, // Default model size - could be made configurable
        dataset_size_gb: 0.5, // Default dataset size - could be made configurable
        // preferred_machines:
        //   distributedConfig.machine_selection === 'manual'
        //     ? selectedMachines
        //     : null,
        exclude_host: true, // Allow using host machine
      };

      // eslint-disable-next-line no-console
      console.log('PLAN REQUEST:', planRequest);

      const planResponse = await fetch(chatAPI.Endpoints.Distributed.Plan(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planRequest),
      });

      if (!planResponse.ok) {
        throw new Error(`Plan request failed: ${planResponse.statusText}`);
      }

      const planData = await planResponse.json();
      console.log('Distributed plan:', planData);

      // if (!planData.machines || planData.machines.length === 0) {
      //   throw new Error('No machines available for distributed training');
      // }

      // eslint-disable-next-line no-console

      // Use the planned machines from the response
      const plannedMachines = planData.plan?.machines.map(
        (m: any) => m.machine_id,
      );
      console.log('Planned machines:', plannedMachines);
      const masterMachineId = planData.plan?.master_machine_id; // Use master from plan
      console.log('MASTER MACHINE ID:', masterMachineId);

      const distributedConfigForQueue = planData.plan?.distributed_config;
      console.log('Distributed config for queue:', distributedConfigForQueue);

      // // Prepare distributed config for queue request
      // const distributedConfigForQueue = {
      //   plan: planData,
      //   plugin_name: pluginName,
      //   config: JSON.parse(trainingTemplate.config),
      //   resource_requirements: distributedConfig.resource_requirements,
      // };

      // Queue distributed task using GET with query parameters
      const queueUrl = chatAPI.Endpoints.Tasks.QueueDistributed(
        trainingTemplate.template_id,
        plannedMachines,
        masterMachineId,
        distributedConfigForQueue,
      );
      console.log('Queue URL:', queueUrl);

      const queueResponse = await fetch(queueUrl, {
        method: 'GET',
      });

      if (!queueResponse.ok) {
        console.error('Queue response:', queueResponse);
        throw new Error(`Queue request failed: ${queueResponse.statusText}`);
      }
      console.log('QUEUE RESPONSE:', queueResponse);

      analytics.track('Task Queued Distributed', {
        task_type: 'TRAIN',
        plugin_name: pluginName,
        experiment_id: experimentId,
        num_machines: distributedConfig.resource_requirements.num_machines,
      });

      onTaskQueued?.();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Distributed training error:', error);
      // eslint-disable-next-line no-alert
      alert(
        `Failed to start distributed training: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  };

  return (
    <>
      {machines.length > 0 ? (
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
                  'aria-label': 'Select training option',
                },
              }}
            >
              <ChevronDownIcon size="12px" />
            </MenuButton>
            <Menu
              placement="bottom-end"
              sx={{
                mt: 0.5,
                minWidth: '280px',
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
                  � Training Options
                </Typography>

                <Divider sx={{ my: 1 }} />

                {/* Distributed Training Option */}
                <MenuItem
                  onClick={() => setDistributedModalOpen(true)}
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
                      <Users
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
                      Distributed Training
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                      Train across one or multiple machines
                    </Typography>
                  </Box>
                </MenuItem>

                <Divider sx={{ my: 1 }} />

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
                  🖥️ Remote Machines
                </Typography>

                {machines.map((machine) => (
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
      )}

      {/* Distributed Training Configuration Modal */}
      <Modal
        open={distributedModalOpen}
        onClose={() => setDistributedModalOpen(false)}
      >
        <ModalDialog sx={{ maxWidth: '800px', width: '90vw' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Configure Distributed Training
          </Typography>

          <Stack spacing={3}>
            <DistributedTrainingSettings
              enabled={distributedEnabled}
              onEnabledChange={setDistributedEnabled}
              config={distributedConfig}
              onConfigChange={setDistributedConfig}
              experimentId={experimentId.toString()}
            />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                onClick={() => setDistributedModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                color="primary"
                disabled={
                  !distributedEnabled || getSelectedMachines().length < 1
                }
                onClick={() => {
                  setDistributedModalOpen(false);
                  handleDistributedTraining();
                }}
              >
                Start Distributed Training
              </Button>
            </Box>
          </Stack>
        </ModalDialog>
      </Modal>
    </>
  );
}

// Ensure chatAPI.Endpoints.Tasks.QueueRemote exists:
// chatAPI.Endpoints.Tasks.QueueRemote = (taskId: number, machineId: number) => `/api/tasks/${taskId}/queue/${machineId}`;
