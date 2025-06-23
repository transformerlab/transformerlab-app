import React, { useState, useEffect } from 'react';
import {
  Box,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormLabel,
  Input,
  Radio,
  RadioGroup,
  Sheet,
  Slider,
  Stack,
  Switch,
  Typography,
  Card,
  CardContent,
  Alert,
  IconButton,
} from '@mui/joy';
import {
  Server,
  Users,
  Cpu,
  HardDrive,
  RefreshCw,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { DistributedTrainingConfig, Machine } from 'renderer/types/distributed';

interface DistributedTrainingSettingsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  config: DistributedTrainingConfig;
  onConfigChange: (config: DistributedTrainingConfig) => void;
  experimentId: string;
}

export default function DistributedTrainingSettings({
  enabled,
  onEnabledChange,
  config,
  onConfigChange,
  experimentId,
}: DistributedTrainingSettingsProps) {
  const [machineSuggestions, setMachineSuggestions] = useState<Machine[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Get available machines
  const { data: machinesData, mutate: mutateMachines } = useAPI('network', [
    'machines',
  ]);
  const machines: Machine[] = machinesData?.data || [];

  const fetchMachineSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const response = await fetch('/api/tasks/distributed/suggest_machines');
      const suggestions = await response.json();
      setMachineSuggestions(suggestions);
    } catch (error) {
      // Handle error silently
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Get machine suggestions when configuration changes
  useEffect(() => {
    if (enabled && config.resource_requirements) {
      fetchMachineSuggestions();
    }
  }, [enabled, config.resource_requirements]);

  const handleResourceRequirementChange = (
    field: keyof DistributedTrainingConfig['resource_requirements'],
    value: number | undefined,
  ) => {
    onConfigChange({
      ...config,
      resource_requirements: {
        ...config.resource_requirements,
        [field]: value,
      },
    });
  };

  const handleMachineSelectionChange = (
    mode: 'auto' | 'manual',
    selectedMachines?: string[],
  ) => {
    onConfigChange({
      ...config,
      machine_selection: mode,
      selected_machines: selectedMachines,
    });
  };

  const getAvailableMachines = () => {
    return machines.filter((machine) => machine.status === 'online');
  };

  // Helper function to safely get machine capabilities with fallbacks
  const getMachineCapabilities = (machine: any) => {
    const serverInfo = machine?.machine_metadata?.last_server_info;

    return {
      gpu_count: serverInfo?.gpu?.length || 0,
      memory: serverInfo?.memory?.total || 0,
      cpu_count: serverInfo?.cpu_count || 0,
    };
  };

  const getResourceSummary = () => {
    const availableMachines = getAvailableMachines();
    let selectedMachinesList;

    if (config.machine_selection === 'manual' && config.selected_machines) {
      selectedMachinesList = availableMachines.filter((m) =>
        config.selected_machines?.includes(m.id),
      );
    } else {
      // Auto mode: use machine suggestions if available, otherwise use available machines
      selectedMachinesList =
        machineSuggestions.length > 0
          ? machineSuggestions.slice(
              0,
              config.resource_requirements.num_machines,
            )
          : availableMachines.slice(
              0,
              config.resource_requirements.num_machines,
            );
    }

    const totalGPUs = selectedMachinesList.reduce(
      (sum, machine) => sum + getMachineCapabilities(machine).gpu_count,
      0,
    );
    const totalMemory = selectedMachinesList.reduce(
      (sum, machine) =>
        sum + getMachineCapabilities(machine).memory / (1024 * 1024),
      0,
    );

    return { selectedMachinesList, totalGPUs, totalMemory };
  };

  const { selectedMachinesList, totalGPUs, totalMemory } = getResourceSummary();

  return (
    <Sheet
      sx={{
        p: 3,
        borderRadius: 'md',
        border: '1px solid',
        borderColor: 'neutral.200',
      }}
    >
      <Stack spacing={3}>
        {/* Enable/Disable Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Switch
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            startDecorator={<Server size={16} />}
            endDecorator={<Users size={16} />}
          />
          <Typography level="title-md">Distributed Training</Typography>
          <IconButton
            size="sm"
            variant="plain"
            onClick={() => mutateMachines()}
          >
            <RefreshCw size={16} />
          </IconButton>
        </Box>

        {enabled && (
          <>
            <Divider />

            {/* Resource Requirements */}
            <Box>
              <Typography level="title-sm" sx={{ mb: 2 }}>
                Resource Requirements
              </Typography>
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>
                    Number of Machines{' '}
                    {config.resource_requirements.num_machines === 1 &&
                      '(Single Machine Mode)'}
                  </FormLabel>
                  <Slider
                    value={config.resource_requirements.num_machines}
                    onChange={(_, value) =>
                      handleResourceRequirementChange(
                        'num_machines',
                        value as number,
                      )
                    }
                    min={1}
                    max={Math.min(
                      8,
                      Math.max(1, getAvailableMachines().length),
                    )}
                    step={1}
                    valueLabelDisplay="on"
                    marks
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>GPUs per Machine (optional)</FormLabel>
                  <Input
                    type="number"
                    value={config.resource_requirements.gpus_per_machine || ''}
                    onChange={(e) =>
                      handleResourceRequirementChange(
                        'gpus_per_machine',
                        parseInt(e.target.value, 10) || undefined,
                      )
                    }
                    placeholder="Auto-detect"
                    startDecorator={<Cpu size={16} />}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Minimum GPU Memory (GB)</FormLabel>
                  <Input
                    type="number"
                    value={config.resource_requirements.min_gpu_memory || ''}
                    onChange={(e) =>
                      handleResourceRequirementChange(
                        'min_gpu_memory',
                        parseInt(e.target.value, 10) || undefined,
                      )
                    }
                    placeholder="No minimum"
                    startDecorator={<HardDrive size={16} />}
                  />
                </FormControl>
              </Stack>
            </Box>

            <Divider />

            {/* Machine Selection */}
            <Box>
              <Typography level="title-sm" sx={{ mb: 2 }}>
                Machine Selection
              </Typography>
              <RadioGroup
                value={config.machine_selection}
                onChange={(event) =>
                  handleMachineSelectionChange(
                    event.target.value as 'auto' | 'manual',
                  )
                }
              >
                <Radio value="auto" label="Automatic Selection" />
                <Radio value="manual" label="Manual Selection" />
              </RadioGroup>

              {config.machine_selection === 'manual' && (
                <Box sx={{ mt: 2 }}>
                  <Typography level="body-sm" sx={{ mb: 1 }}>
                    Select Machines:
                  </Typography>
                  <Stack spacing={1}>
                    {getAvailableMachines().map((machine) => (
                      <Checkbox
                        key={machine.id}
                        checked={
                          config.selected_machines?.includes(machine.id) ||
                          false
                        }
                        onChange={(event) => {
                          const currentSelection =
                            config.selected_machines || [];
                          const newSelection = event.target.checked
                            ? [...currentSelection, machine.id]
                            : currentSelection.filter(
                                (id) => id !== machine.id,
                              );
                          handleMachineSelectionChange('manual', newSelection);
                        }}
                        label={
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <Typography level="body-sm">
                              {machine.name}
                            </Typography>
                            <Chip size="sm" color="success">
                              {getMachineCapabilities(machine).gpu_count} GPUs
                            </Chip>
                            <Chip size="sm" variant="soft">
                              {getMachineCapabilities(machine).memory} MB
                            </Chip>
                          </Box>
                        }
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>

            <Divider />

            {/* Resource Summary */}
            <Card variant="soft" color="primary">
              <CardContent>
                <Typography level="title-sm" sx={{ mb: 1 }}>
                  {selectedMachinesList.length === 1
                    ? 'Single Machine Setup'
                    : 'Training Cluster Summary'}
                </Typography>
                <Stack spacing={1}>
                  <Typography level="body-sm">
                    <strong>Machines:</strong> {selectedMachinesList.length}
                  </Typography>
                  <Typography level="body-sm">
                    <strong>Total GPUs:</strong> {totalGPUs}
                  </Typography>
                  <Typography level="body-sm">
                    <strong>Total Memory:</strong> {totalMemory} MB
                  </Typography>
                  {selectedMachinesList.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography level="body-xs" sx={{ mb: 0.5 }}>
                        Selected Machines:
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ flexWrap: 'wrap', gap: 0.5 }}
                      >
                        {selectedMachinesList.map((machine) => (
                          <Chip key={machine.id} size="sm" variant="soft">
                            {machine.name}
                          </Chip>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {/* Warnings */}
            {getAvailableMachines().length < 1 && (
              <Alert color="warning" startDecorator={<AlertCircle size={16} />}>
                At least 1 machine is required for distributed training. Please
                add machines in the Network section.
              </Alert>
            )}

            {config.resource_requirements.num_machines >
              selectedMachinesList.length && (
              <Alert color="warning" startDecorator={<AlertCircle size={16} />}>
                Not enough machines available to meet resource requirements.
                Consider adjusting the number of machines or adding more to your
                network.
              </Alert>
            )}

            {selectedMachinesList.length > 0 &&
              config.resource_requirements.num_machines <=
                selectedMachinesList.length && (
                <Alert
                  color="success"
                  startDecorator={<CheckCircle size={16} />}
                >
                  Configuration is valid and ready for distributed training.
                  {config.resource_requirements.num_machines === 1 && (
                    <Typography level="body-xs" sx={{ mt: 0.5 }}>
                      Single machine distributed training will use multiple GPUs
                      on the same machine.
                    </Typography>
                  )}
                </Alert>
              )}
          </>
        )}
      </Stack>
    </Sheet>
  );
}
