import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Modal,
  ModalDialog,
  Sheet,
  Stack,
  Typography,
  ModalClose,
  Grid,
} from '@mui/joy';
import { Lock, RefreshCw, Network, Server, Eye } from 'lucide-react';
import { useAPI, getFullPath } from 'renderer/lib/transformerlab-api-sdk';

interface MachineInfo {
  id: number;
  name: string;
  host: string;
  port?: number;
  is_reserved: boolean;
  reserved_by_host?: string;
  reserved_at?: string;
  reservation_duration_minutes?: number;
  reservation_metadata?: any;
}

interface LocalHost {
  identifier: string;
  machine_info: {
    hostname: string;
    ip: string;
  };
  managed_machines: MachineInfo[];
  total_managed: number;
  reserved_machines: number;
}

interface RemoteHost {
  machine_info: {
    id: number;
    name: string;
    host: string;
    port: number;
  };
  reservations: MachineInfo[];
  total_managed: number;
  reserved_machines: number;
}

interface NetworkWideData {
  local_host: LocalHost;
  remote_hosts: RemoteHost[];
}

export default function MultiLevelReservationView() {
  const [cascadeModalOpen, setCascadeModalOpen] = useState(false);
  const [selectedHost, setSelectedHost] = useState<RemoteHost | null>(null);

  // API hooks
  const { data: networkWideData, mutate: mutateNetworkWide } = useAPI(
    'network',
    ['getNetworkWideReservations'],
  );

  const networkWideReservations: NetworkWideData | null =
    networkWideData?.data || null;

  const handleViewCascadeReservations = async (host: RemoteHost) => {
    try {
      const response = await fetch(
        getFullPath('network', ['getCascadeReservations'], {
          targetHostId: host.machine_info.id,
        }),
      );
      const data = await response.json();
      setSelectedHost({
        machine_info: host.machine_info,
        reservations: data?.data?.direct_reservations || [],
        total_managed: data?.data?.direct_reservations?.length || 0,
        reserved_machines:
          data?.data?.direct_reservations?.filter(
            (r: MachineInfo) => r.is_reserved,
          )?.length || 0,
      });
      setCascadeModalOpen(true);
    } catch (error) {
      // Error fetching cascade reservations
    }
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60),
    );

    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const hours = Math.floor(diffMinutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const refreshData = () => {
    mutateNetworkWide();
  };

  if (!networkWideReservations) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography level="body-lg" color="neutral">
          Loading network reservation data...
        </Typography>
      </Box>
    );
  }

  const renderMachineCard = (machine: MachineInfo) => (
    <Card key={machine.id} variant="outlined" sx={{ mb: 1 }}>
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Typography level="body-md" fontWeight="md">
              {machine.name}
            </Typography>
            <Typography level="body-xs" color="neutral">
              {machine.host}:{machine.port || 8338}
            </Typography>
          </Box>
          <Box>
            {machine.is_reserved ? (
              <Stack spacing={0.5} alignItems="flex-end">
                <Chip size="sm" color="warning" startDecorator={<Lock />}>
                  Reserved
                </Chip>
                {machine.reserved_by_host && (
                  <Typography level="body-xs" color="neutral">
                    by {machine.reserved_by_host.split(':')[0]}
                  </Typography>
                )}
                {machine.reserved_at && (
                  <Typography level="body-xs" color="neutral">
                    {formatTimeAgo(machine.reserved_at)}
                  </Typography>
                )}
                {machine.reservation_duration_minutes && (
                  <Typography level="body-xs" color="neutral">
                    for {formatDuration(machine.reservation_duration_minutes)}
                  </Typography>
                )}
              </Stack>
            ) : (
              <Chip size="sm" color="success" variant="soft">
                Available
              </Chip>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );

  const renderNetworkWideView = () => {
    if (!networkWideReservations) return null;

    const totalLocal = networkWideReservations.local_host?.total_managed || 0;
    const reservedLocal =
      networkWideReservations.local_host?.reserved_machines || 0;
    const totalRemote =
      networkWideReservations.remote_hosts?.reduce(
        (sum, host) => sum + host.total_managed,
        0,
      ) || 0;
    const reservedRemote =
      networkWideReservations.remote_hosts?.reduce(
        (sum, host) => sum + host.reserved_machines,
        0,
      ) || 0;

    return (
      <Stack spacing={3}>
        {/* Summary Cards */}
        <Grid container spacing={2}>
          <Grid xs={6}>
            <Card variant="soft" color="primary">
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Server size={24} />
                  <Box>
                    <Typography level="title-lg">{totalLocal}</Typography>
                    <Typography level="body-sm">Local Machines</Typography>
                    <Typography level="body-xs" color="neutral">
                      {reservedLocal} reserved
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6}>
            <Card variant="soft" color="neutral">
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Network size={24} />
                  <Box>
                    <Typography level="title-lg">{totalRemote}</Typography>
                    <Typography level="body-sm">Remote Machines</Typography>
                    <Typography level="body-xs" color="neutral">
                      {reservedRemote} reserved
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Local Host Section */}
        <Card>
          <CardContent>
            <Typography level="title-md" sx={{ mb: 2 }}>
              🏠 Local Host ({networkWideReservations.local_host?.identifier})
            </Typography>
            {networkWideReservations.local_host?.managed_machines?.length >
            0 ? (
              <Stack spacing={1}>
                {networkWideReservations.local_host.managed_machines.map(
                  renderMachineCard,
                )}
              </Stack>
            ) : (
              <Typography level="body-sm" color="neutral">
                No machines managed locally
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Remote Hosts Section */}
        <Card>
          <CardContent>
            <Typography level="title-md" sx={{ mb: 2 }}>
              🌐 Remote Hosts (
              {networkWideReservations.remote_hosts?.length || 0})
            </Typography>
            {networkWideReservations.remote_hosts?.length > 0 ? (
              <Stack spacing={2}>
                {networkWideReservations.remote_hosts.map((host) => (
                  <Card
                    key={host.machine_info.id}
                    variant="outlined"
                    sx={{ p: 2 }}
                  >
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Box sx={{ flex: 1 }}>
                        <Typography level="title-sm">
                          {host.machine_info.name}
                        </Typography>
                        <Typography level="body-xs" color="neutral">
                          {host.machine_info.host}:{host.machine_info.port}
                        </Typography>
                        <Typography level="body-xs">
                          {host.reserved_machines}/{host.total_managed} machines
                          reserved
                        </Typography>
                      </Box>
                      <Button
                        size="sm"
                        variant="outlined"
                        startDecorator={<Eye />}
                        onClick={() => handleViewCascadeReservations(host)}
                      >
                        View Details
                      </Button>
                    </Stack>

                    {host.reservations?.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography level="body-sm" sx={{ mb: 1 }}>
                          Managed Machines:
                        </Typography>
                        <Stack spacing={1}>
                          {host.reservations.slice(0, 3).map(renderMachineCard)}
                          {host.reservations.length > 3 && (
                            <Typography
                              level="body-xs"
                              color="neutral"
                              sx={{ textAlign: 'center' }}
                            >
                              +{host.reservations.length - 3} more machines
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    )}
                  </Card>
                ))}
              </Stack>
            ) : (
              <Typography level="body-sm" color="neutral">
                No remote hosts found
              </Typography>
            )}
          </CardContent>
        </Card>
      </Stack>
    );
  };

  return (
    <Sheet sx={{ height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Typography level="h3" startDecorator={<Network />}>
            Multi-Level Reservations
          </Typography>
          <Button
            size="sm"
            variant="outlined"
            startDecorator={<RefreshCw />}
            onClick={refreshData}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        {renderNetworkWideView()}
      </Box>

      {/* Cascade Details Modal */}
      <Modal open={cascadeModalOpen} onClose={() => setCascadeModalOpen(false)}>
        <ModalDialog size="lg" sx={{ maxWidth: '800px' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Cascade Reservations: {selectedHost?.machine_info?.name}
          </Typography>

          {selectedHost && (
            <Box>
              <Typography level="body-sm" sx={{ mb: 2 }} color="neutral">
                Host: {selectedHost.machine_info.host}:
                {selectedHost.machine_info.port}
              </Typography>

              {selectedHost.reservations?.length > 0 ? (
                <Stack spacing={1}>
                  <Typography level="title-sm" sx={{ mb: 1 }}>
                    Direct Reservations ({selectedHost.reservations.length})
                  </Typography>
                  {selectedHost.reservations.map(renderMachineCard)}
                </Stack>
              ) : (
                <Typography level="body-sm" color="neutral">
                  No reservations found for this host
                </Typography>
              )}
            </Box>
          )}
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
