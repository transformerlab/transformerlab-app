import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Sheet,
  Stack,
  Table,
  Typography,
  ModalClose,
  Grid,
  IconButton,
  Tooltip,
  Divider,
} from '@mui/joy';
import {
  Plus,
  Computer,
  Wifi,
  Trash2,
  RefreshCw,
  Activity,
  Info,
} from 'lucide-react';
import { useAPI, getFullPath } from 'renderer/lib/transformerlab-api-sdk';

interface NetworkMachine {
  id: number;
  name: string;
  host: string;
  port: number;
  status: string;
  last_seen?: string;
  machine_metadata?: any;
  created_at: string;
  updated_at: string;
}

interface NetworkMachineForm {
  name: string;
  host: string;
  port: number;
  api_token?: string;
  metadata?: any;
}

export default function NetworkMachines() {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<NetworkMachine | null>(
    null,
  );
  const [formData, setFormData] = useState<NetworkMachineForm>({
    name: '',
    host: '',
    port: 8338,
    api_token: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // API hooks
  const {
    data: machinesData,
    mutate: mutateMachines,
    isLoading,
  } = useAPI('network', ['machines']);
  const { data: statusData, mutate: mutateStatus } = useAPI('network', [
    'status',
  ]);

  const machines: NetworkMachine[] = machinesData?.data || [];
  const totalMachines = statusData?.data?.total_machines || 0;
  const onlineMachines = statusData?.data?.online || 0;
  const offlineMachines = statusData?.data?.offline || 0;
  const errorMachines = statusData?.data?.error || 0;

  const handleInputChange = (field: keyof NetworkMachineForm, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddMachine = async () => {
    if (!formData.name || !formData.host) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(getFullPath('network', ['addMachine'], {}), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          host: formData.host,
          port: formData.port,
          api_token: formData.api_token || null,
          metadata: formData.metadata || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to add machine');
      }

      // Reset form and close modal
      setFormData({ name: '', host: '', port: 8338, api_token: '' });
      setAddModalOpen(false);

      // Refresh data
      mutateMachines();
      mutateStatus();
    } catch (error) {
      // TODO: Show error toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMachine = async (machineId: number) => {
    try {
      const response = await fetch(
        getFullPath('network', ['removeMachine'], { machineId }),
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to remove machine');
      }

      mutateMachines();
      mutateStatus();
    } catch (error) {
      // Error handling - could show toast notification
    }
  };

  const handlePingMachine = async (machineId: number) => {
    try {
      const response = await fetch(
        getFullPath('network', ['pingMachine'], { machineId }),
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to ping machine');
      }

      mutateMachines();
      mutateStatus();
    } catch (error) {
      // Error handling - could show toast notification
    }
  };

  const handleHealthCheck = async () => {
    try {
      const response = await fetch(
        getFullPath('network', ['healthCheck'], {}),
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to run health check');
      }

      mutateMachines();
      mutateStatus();
    } catch (error) {
      // Error handling - could show toast notification
    }
  };

  const getDeviceColor = (device: string) => {
    if (device === 'cuda') return 'success';
    if (device === 'mps') return 'primary';
    return 'neutral';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'success';
      case 'offline':
        return 'neutral';
      case 'error':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online':
        return '🟢 Online';
      case 'offline':
        return '🔴 Offline';
      case 'error':
        return '⚠️ Error';
      default:
        return '⚪ Unknown';
    }
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        gap: 2,
        p: 2,
      }}
    >
      <Typography level="h2">Network Machines</Typography>

      {/* Status Overview */}
      <Grid container spacing={2}>
        <Grid xs={3}>
          <Card variant="soft" color="primary">
            <CardContent>
              <Typography level="title-lg" startDecorator={<Computer />}>
                Total Machines
              </Typography>
              <Typography level="h2">{totalMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={3}>
          <Card variant="soft" color="success">
            <CardContent>
              <Typography level="title-lg" startDecorator={<Wifi />}>
                Online
              </Typography>
              <Typography level="h2">{onlineMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={3}>
          <Card variant="soft" color="neutral">
            <CardContent>
              <Typography level="title-lg">Offline</Typography>
              <Typography level="h2">{offlineMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={3}>
          <Card variant="soft" color="danger">
            <CardContent>
              <Typography level="title-lg">Error</Typography>
              <Typography level="h2">{errorMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Actions */}
      <Stack direction="row" spacing={2}>
        <Button startDecorator={<Plus />} onClick={() => setAddModalOpen(true)}>
          Add Machine
        </Button>
        <Button
          variant="outlined"
          startDecorator={<Activity />}
          onClick={handleHealthCheck}
        >
          Health Check All
        </Button>
        <Button
          variant="outlined"
          startDecorator={<RefreshCw />}
          onClick={() => {
            mutateMachines();
            mutateStatus();
          }}
        >
          Refresh
        </Button>
      </Stack>

      {/* Machines Table */}
      <Sheet sx={{ overflow: 'auto', flexGrow: 1 }}>
        <Table borderAxis="both">
          <thead>
            <tr>
              <th style={{ width: '150px' }}>Name</th>
              <th style={{ width: '150px' }}>Host</th>
              <th style={{ width: '70px' }}>Port</th>
              <th style={{ width: '100px' }}>Status</th>
              <th style={{ width: '120px' }}>Response Time</th>
              <th style={{ width: '200px' }}>Server Info</th>
              <th style={{ width: '150px' }}>Last Seen</th>
              <th style={{ width: '120px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {machines.map((machine) => {
              const serverInfo = machine.machine_metadata?.last_server_info;
              const responseTime = machine.machine_metadata?.last_response_time;

              return (
                <tr key={machine.id}>
                  <td>
                    <Typography level="body-md" fontWeight="md">
                      {machine.name}
                    </Typography>
                  </td>
                  <td>
                    <Typography level="body-sm">{machine.host}</Typography>
                  </td>
                  <td>
                    <Typography level="body-sm">{machine.port}</Typography>
                  </td>
                  <td>
                    <Chip
                      color={getStatusColor(machine.status)}
                      size="sm"
                      variant="soft"
                    >
                      {getStatusText(machine.status)}
                    </Chip>
                  </td>
                  <td>
                    <Typography level="body-sm">
                      {responseTime
                        ? `${(responseTime * 1000).toFixed(0)}ms`
                        : '-'}
                    </Typography>
                  </td>
                  <td>
                    {serverInfo ? (
                      <Stack spacing={0.5}>
                        <Typography level="body-xs">
                          OS: {serverInfo.os || 'Unknown'}
                        </Typography>
                        <Typography level="body-xs">
                          Python: {serverInfo.python_version || 'Unknown'}
                        </Typography>
                        {serverInfo.gpu && serverInfo.gpu.length > 0 && (
                          <Typography level="body-xs">
                            GPU: {serverInfo.gpu.length} device(s)
                          </Typography>
                        )}
                        {serverInfo.memory && (
                          <Typography level="body-xs">
                            RAM:{' '}
                            {Math.round(serverInfo.memory.total / 1024 ** 3)}
                            GB
                          </Typography>
                        )}
                        {serverInfo.device && (
                          <Chip
                            size="sm"
                            variant="soft"
                            color={getDeviceColor(serverInfo.device)}
                          >
                            {serverInfo.device.toUpperCase()}
                          </Chip>
                        )}
                      </Stack>
                    ) : (
                      <Typography level="body-sm" color="neutral">
                        No info
                      </Typography>
                    )}
                  </td>
                  <td>
                    <Typography level="body-sm">
                      {machine.last_seen
                        ? new Date(machine.last_seen).toLocaleString()
                        : 'Never'}
                    </Typography>
                  </td>
                  <td>
                    <Stack direction="row" spacing={1}>
                      <Tooltip title="Ping machine">
                        <IconButton
                          size="sm"
                          variant="outlined"
                          onClick={() => handlePingMachine(machine.id)}
                        >
                          <Wifi />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove machine">
                        <IconButton
                          size="sm"
                          variant="outlined"
                          color="danger"
                          onClick={() => handleRemoveMachine(machine.id)}
                        >
                          <Trash2 />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="View details">
                        <IconButton
                          size="sm"
                          variant="outlined"
                          onClick={() => {
                            setSelectedMachine(machine);
                            setDetailsModalOpen(true);
                          }}
                        >
                          <Info />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        {machines.length === 0 && !isLoading && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography level="body-lg" color="neutral">
              No network machines configured
            </Typography>
            <Typography level="body-sm" color="neutral">
              Click "Add Machine" to get started
            </Typography>
          </Box>
        )}
      </Sheet>

      {/* Add Machine Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <Typography level="h4" mb={2}>
            Add Network Machine
          </Typography>

          <Stack spacing={2}>
            <FormControl required>
              <FormLabel>Machine Name</FormLabel>
              <Input
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter a friendly name"
              />
            </FormControl>

            <FormControl required>
              <FormLabel>Host/IP Address</FormLabel>
              <Input
                value={formData.host}
                onChange={(e) => handleInputChange('host', e.target.value)}
                placeholder="192.168.1.100 or machine.local"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Port</FormLabel>
              <Input
                type="number"
                value={formData.port}
                onChange={(e) =>
                  handleInputChange(
                    'port',
                    parseInt(e.target.value, 10) || 8338,
                  )
                }
                placeholder="8338"
              />
            </FormControl>

            <FormControl>
              <FormLabel>API Token (Optional)</FormLabel>
              <Input
                value={formData.api_token}
                onChange={(e) => handleInputChange('api_token', e.target.value)}
                placeholder="Bearer token for authentication"
              />
            </FormControl>

            <Stack direction="row" spacing={2} sx={{ pt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setAddModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddMachine}
                loading={isSubmitting}
                disabled={!formData.name || !formData.host}
              >
                Add Machine
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Machine Details Modal */}
      <Modal open={detailsModalOpen} onClose={() => setDetailsModalOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <Typography level="h4" mb={2}>
            Machine Details
          </Typography>

          {selectedMachine && (
            <Stack spacing={2}>
              <Typography level="body-md" fontWeight="md">
                {selectedMachine.name}
              </Typography>
              <Typography level="body-sm" color="neutral">
                {selectedMachine.host}:{selectedMachine.port}
              </Typography>

              <Stack direction="row" spacing={1}>
                <Chip
                  color={getStatusColor(selectedMachine.status)}
                  variant="soft"
                >
                  {getStatusText(selectedMachine.status)}
                </Chip>
                {selectedMachine.machine_metadata?.last_response_time && (
                  <Chip color="neutral" variant="soft">
                    Response Time:{' '}
                    {(
                      selectedMachine.machine_metadata.last_response_time * 1000
                    ).toFixed(0)}
                    ms
                  </Chip>
                )}
              </Stack>

              <Divider />

              <Typography level="body-sm" fontWeight="md">
                Server Info
              </Typography>
              {selectedMachine.machine_metadata?.last_server_info ? (
                <Stack spacing={0.5}>
                  <Typography level="body-xs">
                    OS:{' '}
                    {selectedMachine.machine_metadata.last_server_info.os ||
                      'Unknown'}
                  </Typography>
                  <Typography level="body-xs">
                    Python:{' '}
                    {selectedMachine.machine_metadata.last_server_info
                      .python_version || 'Unknown'}
                  </Typography>
                  {selectedMachine.machine_metadata.last_server_info.gpu &&
                    selectedMachine.machine_metadata.last_server_info.gpu
                      .length > 0 && (
                      <Typography level="body-xs">
                        GPU:{' '}
                        {
                          selectedMachine.machine_metadata.last_server_info.gpu
                            .length
                        }{' '}
                        device(s)
                      </Typography>
                    )}
                  {selectedMachine.machine_metadata.last_server_info.memory && (
                    <Typography level="body-xs">
                      RAM:{' '}
                      {Math.round(
                        selectedMachine.machine_metadata.last_server_info.memory
                          .total /
                          1024 ** 3,
                      )}
                      GB
                    </Typography>
                  )}
                  {selectedMachine.machine_metadata.last_server_info.device && (
                    <Chip
                      size="sm"
                      variant="soft"
                      color={getDeviceColor(
                        selectedMachine.machine_metadata.last_server_info
                          .device,
                      )}
                    >
                      {selectedMachine.machine_metadata.last_server_info.device.toUpperCase()}
                    </Chip>
                  )}
                </Stack>
              ) : (
                <Typography level="body-sm" color="neutral">
                  No info
                </Typography>
              )}

              <Divider />

              <Stack direction="row" spacing={2} sx={{ pt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setDetailsModalOpen(false)}
                >
                  Close
                </Button>
              </Stack>
            </Stack>
          )}
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
