import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormLabel,
  FormHelperText,
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
  LinearProgress,
  Alert,
  Switch,
  Select,
  Option,
} from '@mui/joy';
import {
  Plus,
  Computer,
  Wifi,
  Trash2,
  RefreshCw,
  Activity,
  Info,
  Lock,
  Unlock,
  Clock,
  Layers,
  User,
  Network,
  // Add new icons for quota
  Timer,
  AlertTriangle,
  BarChart3,
  // Add admin icons
  Settings,
  Shield,
  RotateCcw,
} from 'lucide-react';
import { useAPI, getFullPath } from 'renderer/lib/transformerlab-api-sdk';
import MultiLevelReservationView from './MultiLevelReservationView';

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
  is_reserved?: boolean;
  reserved_by_host?: string;
  reserved_at?: string;
  reservation_duration_minutes?: number;
  reservation_metadata?: any;
}

interface NetworkMachineForm {
  name: string;
  host: string;
  port: number;
  api_token?: string;
  metadata?: any;
}

// Add quota interfaces
interface QuotaConfig {
  host_identifier: string;
  time_period: string;
  minutes_limit: number;
  warning_threshold_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface QuotaUsage {
  host_identifier: string;
  time_period: string;
  period_start_date: string;
  minutes_used: number;
  minutes_limit: number;
  usage_percent: number;
  remaining_minutes: number;
  is_warning: boolean;
  is_exceeded: boolean;
}

interface QuotaRemaining {
  remaining_minutes: number;
  remaining_hours: number;
  usage_percent: number;
  is_warning: boolean;
  is_exceeded: boolean;
}

interface QuotaCheckResult {
  can_reserve: boolean;
  requested_minutes: number;
  quota_status: { [key: string]: QuotaUsage };
  warnings: string[];
  errors: string[];
}

// Add admin interfaces
interface AdminQuotaConfig {
  host_identifier: string;
  time_period: string;
  minutes_limit: number;
  warning_threshold_percent: number;
  is_active: boolean;
}

interface AdminHostData {
  configs: QuotaConfig[];
  usage: QuotaUsage[];
}

export default function NetworkMachines() {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [multiLevelModalOpen, setMultiLevelModalOpen] = useState(false);
  const [myReservationsModalOpen, setMyReservationsModalOpen] = useState(false);
  const [myReservationsData, setMyReservationsData] = useState<
    NetworkMachine[]
  >([]);
  const [selectedMachine, setSelectedMachine] = useState<NetworkMachine | null>(
    null,
  );
  const [formData, setFormData] = useState<NetworkMachineForm>({
    name: '',
    host: '',
    port: 8338,
    api_token: '',
  });
  const [reservationData, setReservationData] = useState({
    duration_minutes: 60,
    purpose: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add quota-related state
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaCheckData, setQuotaCheckData] = useState<QuotaCheckResult | null>(
    null,
  );

  // Add admin mode state
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [selectedHostForEdit, setSelectedHostForEdit] = useState<string>('');
  const [quotaConfigForm, setQuotaConfigForm] = useState<AdminQuotaConfig[]>(
    [],
  );
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);

  // Auto-refresh state - hardcoded to 10 seconds
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // API hooks
  const {
    data: machinesData,
    mutate: mutateMachines,
    isLoading,
  } = useAPI('network', ['machines']);
  const { data: statusData, mutate: mutateStatus } = useAPI('network', [
    'status',
  ]);

  // Add quota API hooks
  const { mutate: mutateQuotaConfig } = useAPI('network', ['quotaConfig']);
  const { data: quotaUsageData, mutate: mutateQuotaUsage } = useAPI('network', [
    'quotaUsage',
  ]);
  const { data: quotaRemainingData, mutate: mutateQuotaRemaining } = useAPI(
    'network',
    ['quotaRemaining'],
  );

  // Add admin API hooks
  const { data: adminQuotaData, mutate: mutateAdminQuotaData } = useAPI(
    'network',
    ['quotaAdminHosts'],
    { enabled: isAdminMode },
  );

  const machines: NetworkMachine[] = machinesData?.data || [];
  const totalMachines = statusData?.data?.total_machines || 0;
  const onlineMachines = statusData?.data?.online || 0;
  const offlineMachines = statusData?.data?.offline || 0;
  const errorMachines = statusData?.data?.error || 0;
  const reservedMachines = statusData?.data?.reserved || 0;
  const availableMachines = statusData?.data?.available || 0;

  // Extract quota data
  const quotaUsage = quotaUsageData?.data || {};
  const quotaRemaining = quotaRemainingData?.data || {};

  // Initialize quota config form when admin data changes
  useEffect(() => {
    if (adminQuotaData?.data && Object.keys(adminQuotaData.data).length > 0) {
      const configs: AdminQuotaConfig[] = [];
      Object.entries(adminQuotaData.data).forEach(
        ([hostIdentifier, hostData]) => {
          const typedHostData = hostData as AdminHostData;
          if (typedHostData.configs && typedHostData.configs.length > 0) {
            configs.push({
              host_identifier: hostIdentifier,
              time_period: typedHostData.configs?.[0]?.time_period,
              minutes_limit: typedHostData.configs?.[0]?.minutes_limit,
              warning_threshold_percent:
                typedHostData.configs?.[0]?.warning_threshold_percent,
              is_active: typedHostData.configs?.[0]?.is_active,
            });
          }
        },
      );
      setQuotaConfigForm(configs);
    }
  }, [adminQuotaData]);

  // Helper functions for quota
  const getQuotaColor = (usagePercent: number) => {
    if (usagePercent >= 100) return 'danger';
    if (usagePercent >= 90) return 'warning';
    if (usagePercent >= 80) return 'warning';
    return 'success';
  };

  const formatTimeRemaining = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours < 24) {
      return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };

  const handleCheckQuota = async (durationMinutes: number) => {
    try {
      const response = await fetch(getFullPath('network', ['quotaCheck'], {}), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_minutes: durationMinutes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to check quota');
      }

      const result = await response.json();
      setQuotaCheckData(result.data);
      return result.data;
    } catch (error) {
      // Error handling - in a real app you'd use proper error reporting
      return null;
    }
  };

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

  const handleHealthCheck = useCallback(async () => {
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
      // Also refresh quota data
      mutateQuotaUsage();
      mutateQuotaRemaining();
    } catch (error) {
      // Error handling - could show toast notification
    }
  }, [mutateMachines, mutateStatus, mutateQuotaUsage, mutateQuotaRemaining]);

  const handleManualRefresh = useCallback(async () => {
    mutateMachines();
    mutateStatus();
    mutateQuotaUsage();
    mutateQuotaRemaining();
  }, [mutateMachines, mutateStatus, mutateQuotaUsage, mutateQuotaRemaining]);

  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Hardcoded 10-second interval
    intervalRef.current = setInterval(() => {
      handleHealthCheck();
    }, 10000);
  }, [handleHealthCheck]);

  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Auto-refresh effect - starts automatically
  useEffect(() => {
    startAutoRefresh();
    // Run initial health check
    handleHealthCheck();

    return () => stopAutoRefresh();
  }, [startAutoRefresh, stopAutoRefresh, handleHealthCheck]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAutoRefresh();
  }, [stopAutoRefresh]);

  const handleReserveMachine = async (machineId: number) => {
    setIsSubmitting(true);
    try {
      // First check quota before making reservation
      const quotaCheck = await handleCheckQuota(
        reservationData.duration_minutes,
      );

      if (quotaCheck && !quotaCheck.can_reserve) {
        // Show quota exceeded error - in a real app you'd use a proper toast/snackbar
        // For now, just prevent the reservation
        return;
      }

      const response = await fetch(
        getFullPath('network', ['reserveMachine'], { machineId }),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            duration_minutes: reservationData.duration_minutes,
            metadata: {
              purpose: reservationData.purpose,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to reserve machine');
      }

      setReservationModalOpen(false);
      setReservationData({ duration_minutes: 60, purpose: '' });

      // Refresh all data including quota
      mutateMachines();
      mutateStatus();
      mutateQuotaUsage();
      mutateQuotaRemaining();
    } catch (error) {
      // Error handling - could show toast notification
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReleaseMachine = async (machineId: number) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(
        getFullPath('network', ['releaseMachine'], { machineId }),
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to release machine');
      }

      mutateMachines();
      mutateStatus();
    } catch (error) {
      // Error handling - could show toast notification
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCleanupExpiredReservations = async () => {
    try {
      const response = await fetch(
        getFullPath('network', ['cleanupExpiredReservations'], {}),
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to cleanup expired reservations');
      }

      mutateMachines();
      mutateStatus();
    } catch (error) {
      // Error handling - could show toast notification
    }
  };

  // Admin quota management handler
  const handleAdminQuotaConfigSave = async (config: AdminQuotaConfig) => {
    try {
      setIsAdminSubmitting(true);
      console.log('Saving admin quota config:', config);
      // console.log(
      //   'FULL PATH:',
      //   getFullPath('network', ['quota', 'config'], {}),
      // );
      const response = await fetch(
        getFullPath('network', ['quotaSetConfig'], {}),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([config]),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to save quota configuration');
      }

      // Reset edit state
      setSelectedHostForEdit('');

      // Refresh admin data
      mutateAdminQuotaData();
      mutateQuotaConfig();
    } catch (error) {
      // Could show toast notification here
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  const handleAdminQuotaReset = async (hostIdentifier: string) => {
    try {
      setIsAdminSubmitting(true);
      const response = await fetch(
        getFullPath('network', ['quotaAdminReset'], { hostIdentifier }),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to reset quota');
      }

      // Refresh admin data
      mutateAdminQuotaData();
      mutateQuotaUsage();
    } catch (error) {
      // Could show toast notification here
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  const formatReservationTime = (
    reservedAt: string,
    durationMinutes?: number,
  ) => {
    const reservedDate = new Date(reservedAt);
    if (durationMinutes) {
      const expiresAt = new Date(
        reservedDate.getTime() + durationMinutes * 60000,
      );
      const now = new Date();
      const isExpired = now > expiresAt;

      if (isExpired) {
        return 'Expired';
      }

      const timeLeft = Math.max(
        0,
        Math.floor((expiresAt.getTime() - now.getTime()) / 60000),
      );
      return `${timeLeft}m left`;
    }
    return 'Indefinite';
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

      {/* Admin Mode Switch */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Switch
          checked={isAdminMode}
          onChange={(e) => setIsAdminMode(e.target.checked)}
          color="primary"
          startDecorator={<Settings />}
        />
        <Typography level="body-md">Admin Mode</Typography>
        {isAdminMode && (
          <Button
            size="sm"
            variant="outlined"
            startDecorator={<Shield />}
            onClick={() => setAdminModalOpen(true)}
          >
            Quota Management
          </Button>
        )}
      </Stack>

      {/* Status Overview */}
      <Grid container spacing={2}>
        <Grid xs={2}>
          <Card variant="soft" color="primary">
            <CardContent>
              <Typography level="title-lg" startDecorator={<Computer />}>
                Total
              </Typography>
              <Typography level="h2">{totalMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={2}>
          <Card variant="soft" color="success">
            <CardContent>
              <Typography level="title-lg" startDecorator={<Wifi />}>
                Online
              </Typography>
              <Typography level="h2">{onlineMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={2}>
          <Card variant="soft" color="neutral">
            <CardContent>
              <Typography level="title-lg">Offline</Typography>
              <Typography level="h2">{offlineMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={2}>
          <Card variant="soft" color="danger">
            <CardContent>
              <Typography level="title-lg">Error</Typography>
              <Typography level="h2">{errorMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={2}>
          <Card variant="soft" color="warning">
            <CardContent>
              <Typography level="title-lg" startDecorator={<Lock />}>
                Reserved
              </Typography>
              <Typography level="h2">{reservedMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={2}>
          <Card variant="soft" color="primary">
            <CardContent>
              <Typography level="title-lg" startDecorator={<Unlock />}>
                Available
              </Typography>
              <Typography level="h2">{availableMachines}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quota Status Section */}
      {quotaRemainingData && Object.keys(quotaRemaining).length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography level="h4" startDecorator={<Timer />}>
              Quota Status
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              {Object.entries(quotaRemaining).map(([period, data]) => {
                const quotaPeriodData = data as QuotaRemaining;
                return (
                  <Stack key={period} spacing={1}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography level="title-sm" textTransform="capitalize">
                        {period}
                      </Typography>
                      <Typography level="body-sm" color="neutral">
                        {formatTimeRemaining(quotaPeriodData.remaining_minutes)}{' '}
                        remaining
                      </Typography>
                    </Stack>
                    <Box sx={{ position: 'relative', width: '100%' }}>
                      <LinearProgress
                        determinate
                        value={quotaPeriodData.usage_percent}
                        color={getQuotaColor(quotaPeriodData.usage_percent)}
                        size="lg"
                        sx={{
                          flexGrow: 1,
                          '& .MuiLinearProgress-bar': {
                            transition: 'none !important',
                          },
                        }}
                      />
                      <Typography
                        level="body-xs"
                        color="neutral"
                        sx={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                        }}
                      >
                        {quotaPeriodData.usage_percent.toFixed(1)}% used
                      </Typography>
                    </Box>
                    {quotaPeriodData.is_warning && (
                      <Alert
                        variant="soft"
                        color="warning"
                        startDecorator={<AlertTriangle />}
                        size="sm"
                      >
                        Approaching quota limit
                      </Alert>
                    )}
                    {quotaPeriodData.is_exceeded && (
                      <Alert
                        variant="soft"
                        color="danger"
                        startDecorator={<AlertTriangle />}
                        size="sm"
                      >
                        Quota exceeded - reservations blocked
                      </Alert>
                    )}
                  </Stack>
                );
              })}
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                startDecorator={<BarChart3 />}
                onClick={() => setQuotaModalOpen(true)}
                size="sm"
              >
                View Details
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Network-Wide Reservation Status */}
      <Card variant="outlined">
        <CardContent>
          <Typography level="h4" startDecorator={<Network />}>
            Network-Wide Reservation Status
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              startDecorator={<Layers />}
              onClick={() => setMultiLevelModalOpen(true)}
            >
              View Multi-Level Details
            </Button>
            <Button
              variant="outlined"
              startDecorator={<User />}
              onClick={async () => {
                try {
                  const response = await fetch(
                    getFullPath('network', ['getMyReservations'], {}),
                    { method: 'GET' },
                  );
                  if (response.ok) {
                    const result = await response.json();
                    setMyReservationsData(result.data || []);
                    setMyReservationsModalOpen(true);
                  }
                } catch (error) {
                  // Error handling
                }
              }}
            >
              My Reservations
            </Button>
          </Stack>
        </CardContent>
      </Card>

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
          startDecorator={<Clock />}
          onClick={handleCleanupExpiredReservations}
        >
          Cleanup Expired
        </Button>
        <Button
          variant="outlined"
          startDecorator={<RefreshCw />}
          onClick={handleManualRefresh}
        >
          Refresh Now
        </Button>
      </Stack>

      {/* Machines Table */}
      <Sheet sx={{ overflow: 'auto', flexGrow: 1 }}>
        <Table borderAxis="both">
          <thead>
            <tr>
              <th style={{ width: '120px' }}>Name</th>
              <th style={{ width: '120px' }}>Host</th>
              <th style={{ width: '60px' }}>Port</th>
              <th style={{ width: '80px' }}>Status</th>
              <th style={{ width: '100px' }}>Reservation</th>
              <th style={{ width: '100px' }}>Response Time</th>
              <th style={{ width: '160px' }}>Server Info</th>
              <th style={{ width: '120px' }}>Last Seen</th>
              <th style={{ width: '140px' }}>Actions</th>
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
                    {machine.is_reserved ? (
                      <Stack spacing={0.5}>
                        <Chip
                          color="warning"
                          size="sm"
                          variant="soft"
                          startDecorator={<Lock />}
                        >
                          Reserved
                        </Chip>
                        {machine.reserved_by_host && (
                          <Typography level="body-xs" color="neutral">
                            By: {machine.reserved_by_host.split(':')[0]}
                          </Typography>
                        )}
                        {machine.reserved_at &&
                          machine.reservation_duration_minutes && (
                            <Typography level="body-xs" color="neutral">
                              {formatReservationTime(
                                machine.reserved_at,
                                machine.reservation_duration_minutes,
                              )}
                            </Typography>
                          )}
                      </Stack>
                    ) : (
                      <Chip
                        color="success"
                        size="sm"
                        variant="soft"
                        startDecorator={<Unlock />}
                      >
                        Available
                      </Chip>
                    )}
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
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ flexWrap: 'wrap' }}
                    >
                      {machine.is_reserved ? (
                        <Tooltip title="Release reservation">
                          <IconButton
                            size="sm"
                            variant="outlined"
                            color="warning"
                            onClick={() => handleReleaseMachine(machine.id)}
                            disabled={isSubmitting}
                          >
                            <Unlock />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Reserve machine">
                          <IconButton
                            size="sm"
                            variant="outlined"
                            color="success"
                            onClick={() => {
                              setSelectedMachine(machine);
                              setReservationModalOpen(true);
                            }}
                            disabled={
                              machine.status !== 'online' || isSubmitting
                            }
                          >
                            <Lock />
                          </IconButton>
                        </Tooltip>
                      )}
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
              Click &quot;Add Machine&quot; to get started
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

              <Typography level="body-sm" fontWeight="md">
                Reservation Status
              </Typography>
              {selectedMachine.is_reserved ? (
                <Stack spacing={1}>
                  <Chip
                    color="warning"
                    variant="soft"
                    startDecorator={<Lock />}
                  >
                    Reserved
                  </Chip>
                  {selectedMachine.reserved_by_host && (
                    <Typography level="body-xs" color="neutral">
                      Reserved by:{' '}
                      {selectedMachine.reserved_by_host.split(':')[0]}
                    </Typography>
                  )}
                  {selectedMachine.reserved_at && (
                    <Typography level="body-xs" color="neutral">
                      Reserved at:{' '}
                      {new Date(selectedMachine.reserved_at).toLocaleString()}
                    </Typography>
                  )}
                  {selectedMachine.reservation_duration_minutes && (
                    <Typography level="body-xs" color="neutral">
                      Duration: {selectedMachine.reservation_duration_minutes}{' '}
                      minutes
                    </Typography>
                  )}
                  {selectedMachine.reservation_metadata?.purpose && (
                    <Typography level="body-xs" color="neutral">
                      Purpose: {selectedMachine.reservation_metadata.purpose}
                    </Typography>
                  )}
                </Stack>
              ) : (
                <Chip
                  color="success"
                  variant="soft"
                  startDecorator={<Unlock />}
                >
                  Available for reservation
                </Chip>
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

      {/* Reservation Modal */}
      <Modal
        open={reservationModalOpen}
        onClose={() => setReservationModalOpen(false)}
      >
        <ModalDialog>
          <ModalClose />
          <Typography level="h4" mb={2}>
            Reserve Machine: {selectedMachine?.name}
          </Typography>

          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Duration (minutes)</FormLabel>
              <Input
                type="number"
                value={reservationData.duration_minutes}
                onChange={(e) => {
                  const newDuration = parseInt(e.target.value, 10) || 60;
                  setReservationData({
                    ...reservationData,
                    duration_minutes: newDuration,
                  });
                  // Check quota when duration changes
                  handleCheckQuota(newDuration);
                }}
                placeholder="60"
                endDecorator="minutes"
              />
              <FormHelperText>
                Leave blank or set to 0 for indefinite reservation
              </FormHelperText>
            </FormControl>

            <FormControl>
              <FormLabel>Purpose (optional)</FormLabel>
              <Input
                value={reservationData.purpose}
                onChange={(e) =>
                  setReservationData({
                    ...reservationData,
                    purpose: e.target.value,
                  })
                }
                placeholder="Training, evaluation, etc."
              />
            </FormControl>

            {/* Show quota check results */}
            {quotaCheckData && (
              <Card variant="outlined">
                <CardContent>
                  <Typography level="title-sm" sx={{ mb: 1 }}>
                    Quota Check
                  </Typography>

                  {quotaCheckData.can_reserve ? (
                    <Alert
                      variant="soft"
                      color="success"
                      size="sm"
                      sx={{ mb: 1 }}
                    >
                      ✓ Reservation allowed
                    </Alert>
                  ) : (
                    <Alert
                      variant="soft"
                      color="danger"
                      size="sm"
                      sx={{ mb: 1 }}
                    >
                      ✗ Quota exceeded
                    </Alert>
                  )}

                  {quotaCheckData.warnings.length > 0 && (
                    <Alert
                      variant="soft"
                      color="warning"
                      size="sm"
                      sx={{ mb: 1 }}
                    >
                      {quotaCheckData.warnings.join(', ')}
                    </Alert>
                  )}

                  {quotaCheckData.errors.length > 0 && (
                    <Alert
                      variant="soft"
                      color="danger"
                      size="sm"
                      sx={{ mb: 1 }}
                    >
                      {quotaCheckData.errors.join(', ')}
                    </Alert>
                  )}

                  <Typography level="body-xs" color="neutral">
                    Requested: {quotaCheckData.requested_minutes} minutes
                  </Typography>

                  {Object.entries(quotaCheckData.quota_status).map(
                    ([period, status]) => {
                      const quotaStatusData = status as QuotaUsage;
                      return (
                        <Typography
                          key={period}
                          level="body-xs"
                          color="neutral"
                        >
                          {period}: {quotaStatusData.minutes_used} /{' '}
                          {quotaStatusData.minutes_limit} minutes (
                          {quotaStatusData.usage_percent.toFixed(1)}%)
                        </Typography>
                      );
                    },
                  )}
                </CardContent>
              </Card>
            )}

            <Stack direction="row" spacing={2} sx={{ pt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setReservationModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  selectedMachine && handleReserveMachine(selectedMachine.id)
                }
                loading={isSubmitting}
                startDecorator={<Lock />}
                disabled={
                  isSubmitting ||
                  (quotaCheckData && !quotaCheckData.can_reserve) ||
                  false
                }
              >
                Reserve Machine
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Multi-Level Reservations Modal */}
      <Modal
        open={multiLevelModalOpen}
        onClose={() => setMultiLevelModalOpen(false)}
      >
        <ModalDialog size="lg" sx={{ maxWidth: '95vw', maxHeight: '90vh' }}>
          <ModalClose />
          <MultiLevelReservationView />
        </ModalDialog>
      </Modal>

      {/* My Reservations Modal */}
      <Modal
        open={myReservationsModalOpen}
        onClose={() => setMyReservationsModalOpen(false)}
      >
        <ModalDialog size="lg" sx={{ maxWidth: '800px' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            My Reservations
          </Typography>

          {myReservationsData.length > 0 ? (
            <Stack spacing={2}>
              {myReservationsData.map((machine) => {
                const timeRemaining =
                  machine.reserved_at && machine.reservation_duration_minutes
                    ? (() => {
                        const reservedTime = new Date(machine.reserved_at);
                        const expiryTime = new Date(
                          reservedTime.getTime() +
                            machine.reservation_duration_minutes * 60000,
                        );
                        const now = new Date();
                        const remainingMs =
                          expiryTime.getTime() - now.getTime();
                        const remainingMinutes = Math.max(
                          0,
                          Math.floor(remainingMs / 60000),
                        );

                        if (remainingMinutes < 60)
                          return `${remainingMinutes}m`;
                        const hours = Math.floor(remainingMinutes / 60);
                        const mins = remainingMinutes % 60;
                        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
                      })()
                    : 'Unknown';

                const isExpired =
                  machine.reserved_at && machine.reservation_duration_minutes
                    ? new Date().getTime() >
                      new Date(machine.reserved_at).getTime() +
                        machine.reservation_duration_minutes * 60000
                    : false;

                return (
                  <Card key={machine.id} variant="outlined">
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ flex: 1 }}>
                          <Typography level="title-md" fontWeight="md">
                            {machine.name}
                          </Typography>
                          <Typography level="body-sm" color="neutral">
                            {machine.host}:{machine.port}
                          </Typography>
                          <Typography level="body-xs" color="neutral">
                            Purpose:{' '}
                            {machine.reservation_metadata?.purpose ||
                              'No purpose specified'}
                          </Typography>
                        </Box>

                        <Box sx={{ textAlign: 'right' }}>
                          <Chip
                            size="sm"
                            color={isExpired ? 'danger' : 'warning'}
                            startDecorator={<Lock />}
                          >
                            {isExpired ? 'Expired' : 'Reserved'}
                          </Chip>
                          <Typography
                            level="body-xs"
                            color="neutral"
                            sx={{ mt: 0.5 }}
                          >
                            {isExpired
                              ? 'Reservation expired'
                              : `${timeRemaining} remaining`}
                          </Typography>
                          <Typography level="body-xs" color="neutral">
                            Duration: {machine.reservation_duration_minutes}m
                          </Typography>
                        </Box>
                      </Stack>

                      {/* Machine Stats */}
                      {machine.machine_metadata?.last_server_info && (
                        <Box
                          sx={{
                            mt: 2,
                            pt: 2,
                            borderTop: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Grid container spacing={2}>
                            <Grid xs={4}>
                              <Typography level="body-xs" color="neutral">
                                CPU:{' '}
                                {
                                  machine.machine_metadata.last_server_info
                                    .cpu_percent
                                }
                                %
                              </Typography>
                            </Grid>
                            <Grid xs={4}>
                              <Typography level="body-xs" color="neutral">
                                Memory:{' '}
                                {
                                  machine.machine_metadata.last_server_info
                                    .memory?.percent
                                }
                                %
                              </Typography>
                            </Grid>
                            <Grid xs={4}>
                              <Typography level="body-xs" color="neutral">
                                GPUs:{' '}
                                {machine.machine_metadata.last_server_info.gpu
                                  ?.length || 0}
                              </Typography>
                            </Grid>
                          </Grid>

                          {machine.machine_metadata.last_server_info.gpu
                            ?.length > 0 && (
                            <Box sx={{ mt: 1 }}>
                              <Typography level="body-xs" color="neutral">
                                GPU:{' '}
                                {
                                  machine.machine_metadata.last_server_info
                                    .gpu[0]?.name
                                }
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      )}

                      {/* Actions */}
                      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Button
                          size="sm"
                          variant="outlined"
                          startDecorator={<Unlock />}
                          onClick={async () => {
                            try {
                              const response = await fetch(
                                getFullPath('network', ['releaseMachine'], {
                                  machineId: machine.id,
                                }),
                                { method: 'POST' },
                              );
                              if (response.ok) {
                                // Refresh the reservations data
                                const refreshResponse = await fetch(
                                  getFullPath(
                                    'network',
                                    ['getMyReservations'],
                                    {},
                                  ),
                                  { method: 'GET' },
                                );
                                if (refreshResponse.ok) {
                                  const result = await refreshResponse.json();
                                  setMyReservationsData(result.data || []);
                                }
                              }
                            } catch (error) {
                              // Error handling
                            }
                          }}
                        >
                          Release Early
                        </Button>
                        <Button
                          size="sm"
                          variant="outlined"
                          startDecorator={<Clock />}
                          onClick={() => {
                            // Future: Extend reservation functionality
                          }}
                        >
                          Extend
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography level="body-lg" color="neutral">
                You have no active reservations
              </Typography>
            </Box>
          )}
        </ModalDialog>
      </Modal>

      {/* Quota Details Modal */}
      <Modal open={quotaModalOpen} onClose={() => setQuotaModalOpen(false)}>
        <ModalDialog size="lg" sx={{ maxWidth: '800px' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Quota Details
          </Typography>

          {quotaUsageData && Object.keys(quotaUsage).length > 0 ? (
            <Stack spacing={3}>
              {Object.entries(quotaUsage).map(([period, usage]) => {
                const usageData = usage as QuotaUsage;
                return (
                  <Card key={period} variant="outlined">
                    <CardContent>
                      <Typography
                        level="title-md"
                        textTransform="capitalize"
                        sx={{ mb: 2 }}
                      >
                        {period} Quota
                      </Typography>

                      <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid xs={6}>
                          <Typography level="body-sm" color="neutral">
                            Used: {usageData.minutes_used} minutes
                          </Typography>
                        </Grid>
                        <Grid xs={6}>
                          <Typography level="body-sm" color="neutral">
                            Limit: {usageData.minutes_limit} minutes
                          </Typography>
                        </Grid>
                        <Grid xs={6}>
                          <Typography level="body-sm" color="neutral">
                            Remaining: {usageData.remaining_minutes} minutes
                          </Typography>
                        </Grid>
                        <Grid xs={6}>
                          <Typography level="body-sm" color="neutral">
                            Usage: {usageData.usage_percent.toFixed(1)}%
                          </Typography>
                        </Grid>
                      </Grid>

                      <Box sx={{ position: 'relative', width: '100%', mb: 1 }}>
                        <LinearProgress
                          determinate
                          value={usageData.usage_percent}
                          color={getQuotaColor(usageData.usage_percent)}
                          size="lg"
                          sx={{
                            '& .MuiLinearProgress-bar': {
                              transition: 'none !important',
                            },
                          }}
                        />
                      </Box>

                      <Typography level="body-xs" color="neutral">
                        Period: {usageData.period_start_date} to current
                      </Typography>

                      {usageData.is_warning && (
                        <Alert
                          variant="soft"
                          color="warning"
                          startDecorator={<AlertTriangle />}
                          size="sm"
                          sx={{ mt: 1 }}
                        >
                          Warning: Approaching quota limit
                        </Alert>
                      )}

                      {usageData.is_exceeded && (
                        <Alert
                          variant="soft"
                          color="danger"
                          startDecorator={<AlertTriangle />}
                          size="sm"
                          sx={{ mt: 1 }}
                        >
                          Quota exceeded - reservations blocked
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography level="body-lg" color="neutral">
                No quota information available
              </Typography>
            </Box>
          )}
        </ModalDialog>
      </Modal>

      {/* Admin Mode Modal */}
      <Modal open={adminModalOpen} onClose={() => setAdminModalOpen(false)}>
        <ModalDialog size="lg" sx={{ maxWidth: '800px' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Admin Mode - Quota Management
          </Typography>

          <Stack spacing={2}>
            <Button
              variant={isAdminMode ? 'soft' : 'outlined'}
              color="primary"
              onClick={() => setIsAdminMode(true)}
              startDecorator={<Settings />}
              fullWidth
            >
              Enable Admin Mode
            </Button>
            <Button
              variant={!isAdminMode ? 'soft' : 'outlined'}
              color="neutral"
              onClick={() => setIsAdminMode(false)}
              startDecorator={<Shield />}
              fullWidth
            >
              Disable Admin Mode
            </Button>

            {isAdminMode && (
              <>
                <Divider sx={{ my: 2 }} />

                <Typography level="body-md" fontWeight="md">
                  Host Quota Configurations
                </Typography>
                <Typography level="body-sm" color="neutral">
                  Configure quotas for available hosts
                </Typography>

                {adminQuotaData?.data &&
                Object.keys(adminQuotaData.data).length > 0 ? (
                  <Stack spacing={2}>
                    {/* Existing host configurations */}
                    {adminQuotaData?.data &&
                      Object.entries(adminQuotaData.data).map(
                        ([hostIdentifier, hostData]) => {
                          const typedHostData = hostData as AdminHostData;
                          const isEditing =
                            selectedHostForEdit === hostIdentifier;
                          return (
                            <Card
                              key={hostIdentifier}
                              variant="outlined"
                              sx={{
                                p: 2,
                                borderColor:
                                  isEditing && isAdminMode
                                    ? 'primary.main'
                                    : 'divider',
                              }}
                            >
                              <Stack spacing={1}>
                                <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                  alignItems="center"
                                >
                                  <Typography level="title-sm">
                                    {hostIdentifier}
                                  </Typography>
                                  <Stack direction="row" spacing={1}>
                                    <Button
                                      variant="outlined"
                                      size="sm"
                                      onClick={() => {
                                        if (isEditing) {
                                          // Save changes
                                          const updatedConfig =
                                            quotaConfigForm.find(
                                              (config) =>
                                                config.host_identifier ===
                                                hostIdentifier,
                                            );
                                          if (updatedConfig) {
                                            handleAdminQuotaConfigSave(
                                              updatedConfig,
                                            );
                                          }
                                        } else {
                                          // Edit mode - ensure config is in form
                                          setSelectedHostForEdit(
                                            hostIdentifier,
                                          );
                                          const existingFormConfig =
                                            quotaConfigForm.find(
                                              (config) =>
                                                config.host_identifier ===
                                                hostIdentifier,
                                            );
                                          if (
                                            !existingFormConfig &&
                                            typedHostData.configs?.[0]
                                          ) {
                                            setQuotaConfigForm((prev) => [
                                              ...prev,
                                              {
                                                host_identifier: hostIdentifier,
                                                time_period:
                                                  typedHostData.configs?.[0]
                                                    ?.time_period,
                                                minutes_limit:
                                                  typedHostData.configs?.[0]
                                                    ?.minutes_limit,
                                                warning_threshold_percent:
                                                  typedHostData.configs?.[0]
                                                    ?.warning_threshold_percent,
                                                is_active:
                                                  typedHostData.configs?.[0]
                                                    ?.is_active,
                                              },
                                            ]);
                                          }
                                        }
                                      }}
                                    >
                                      {isEditing ? 'Save' : 'Edit'}
                                    </Button>

                                    {!isEditing && (
                                      <Button
                                        variant="outlined"
                                        size="sm"
                                        color="warning"
                                        startDecorator={<RotateCcw />}
                                        onClick={() =>
                                          handleAdminQuotaReset(hostIdentifier)
                                        }
                                        disabled={isAdminSubmitting}
                                      >
                                        Reset Quota
                                      </Button>
                                    )}
                                  </Stack>
                                </Stack>

                                {isEditing ? (
                                  <Stack spacing={1}>
                                    <FormControl>
                                      <FormLabel>Time Period</FormLabel>
                                      <Select
                                        value={
                                          quotaConfigForm.find(
                                            (config) =>
                                              config.host_identifier ===
                                              hostIdentifier,
                                          )?.time_period || ''
                                        }
                                        onChange={(_, value) => {
                                          if (value) {
                                            setQuotaConfigForm((prev) =>
                                              prev.map((config) =>
                                                config.host_identifier ===
                                                hostIdentifier
                                                  ? {
                                                      ...config,
                                                      time_period:
                                                        value as string,
                                                    }
                                                  : config,
                                              ),
                                            );
                                          }
                                        }}
                                      >
                                        <Option value="daily">Daily</Option>
                                        <Option value="weekly">Weekly</Option>
                                        <Option value="monthly">Monthly</Option>
                                      </Select>
                                    </FormControl>

                                    <FormControl>
                                      <FormLabel>Minutes Limit</FormLabel>
                                      <Input
                                        type="number"
                                        value={
                                          quotaConfigForm.find(
                                            (config) =>
                                              config.host_identifier ===
                                              hostIdentifier,
                                          )?.minutes_limit || 0
                                        }
                                        onChange={(e) => {
                                          const newLimit = parseInt(
                                            e.target.value,
                                            10,
                                          );
                                          setQuotaConfigForm((prev) =>
                                            prev.map((config) =>
                                              config.host_identifier ===
                                              hostIdentifier
                                                ? {
                                                    ...config,
                                                    minutes_limit: newLimit,
                                                  }
                                                : config,
                                            ),
                                          );
                                        }}
                                      />
                                    </FormControl>

                                    <FormControl>
                                      <FormLabel>
                                        Warning Threshold (%)
                                      </FormLabel>
                                      <Input
                                        type="number"
                                        value={
                                          quotaConfigForm.find(
                                            (config) =>
                                              config.host_identifier ===
                                              hostIdentifier,
                                          )?.warning_threshold_percent || 0
                                        }
                                        onChange={(e) => {
                                          const newThreshold = parseInt(
                                            e.target.value,
                                            10,
                                          );
                                          setQuotaConfigForm((prev) =>
                                            prev.map((config) =>
                                              config.host_identifier ===
                                              hostIdentifier
                                                ? {
                                                    ...config,
                                                    warning_threshold_percent:
                                                      newThreshold,
                                                  }
                                                : config,
                                            ),
                                          );
                                        }}
                                      />
                                    </FormControl>

                                    <FormControl>
                                      <FormLabel>Active</FormLabel>
                                      <Switch
                                        checked={
                                          quotaConfigForm.find(
                                            (config) =>
                                              config.host_identifier ===
                                              hostIdentifier,
                                          )?.is_active || false
                                        }
                                        onChange={(e) => {
                                          const isActive = e.target.checked;
                                          setQuotaConfigForm((prev) =>
                                            prev.map((config) =>
                                              config.host_identifier ===
                                              hostIdentifier
                                                ? {
                                                    ...config,
                                                    is_active: isActive,
                                                  }
                                                : config,
                                            ),
                                          );
                                        }}
                                      />
                                    </FormControl>
                                  </Stack>
                                ) : (
                                  <Stack spacing={1}>
                                    <Typography level="body-sm" color="neutral">
                                      Time Period:{' '}
                                      {typedHostData.configs?.[0]
                                        ?.time_period || 'Not set'}
                                    </Typography>
                                    <Typography level="body-sm" color="neutral">
                                      Minutes Limit:{' '}
                                      {typedHostData.configs?.[0]
                                        ?.minutes_limit || 'Not set'}
                                    </Typography>
                                    <Typography level="body-sm" color="neutral">
                                      Warning Threshold:{' '}
                                      {typedHostData.configs?.[0]
                                        ?.warning_threshold_percent ||
                                        'Not set'}
                                      %
                                    </Typography>
                                    <Typography level="body-sm" color="neutral">
                                      Active:{' '}
                                      {typedHostData.configs?.[0]?.is_active
                                        ? 'Yes'
                                        : 'No'}
                                    </Typography>
                                  </Stack>
                                )}
                              </Stack>
                            </Card>
                          );
                        },
                      )}
                  </Stack>
                ) : (
                  <Typography level="body-sm" color="neutral">
                    No quota configurations found for any hosts.
                  </Typography>
                )}
              </>
            )}
          </Stack>
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
