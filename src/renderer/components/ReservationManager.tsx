import React, { useState } from 'react';
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
} from '@mui/joy';
import {
  Lock,
  Unlock,
  Clock,
  User,
  RefreshCw,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { useAPI, getFullPath } from 'renderer/lib/transformerlab-api-sdk';

interface Reservation {
  machine_id: number;
  machine_name: string;
  reserved_by_host: string;
  reserved_at: string;
  duration_minutes?: number;
  metadata?: any;
  host_identifier: string;
}

interface ReservationsByHost {
  [hostIdentifier: string]: Reservation[];
}

export default function ReservationManager() {
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // API hooks
  const { data: reservationsData, mutate: mutateReservations } = useAPI(
    'network',
    ['getReservations'],
  );
  const { data: myReservationsData, mutate: mutateMyReservations } = useAPI(
    'network',
    ['getMyReservations'],
  );
  const { data: statusData } = useAPI('network', ['status']);

  const allReservations: Reservation[] = reservationsData?.data || [];
  const myReservations: Reservation[] = myReservationsData?.data || [];
  const reservationsByHost: ReservationsByHost =
    statusData?.data?.reservation_by_host || {};

  const handleCleanupExpiredReservations = async () => {
    setIsSubmitting(true);
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

      setCleanupModalOpen(false);
      mutateReservations();
      mutateMyReservations();
    } catch (error) {
      // Error handling
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatReservationTime = (
    reservedAt: string,
    durationMinutes?: number,
  ) => {
    const reservedDate = new Date(reservedAt);
    const formattedDate = reservedDate.toLocaleString();

    if (durationMinutes) {
      const expiresAt = new Date(
        reservedDate.getTime() + durationMinutes * 60000,
      );
      const now = new Date();
      const isExpired = now > expiresAt;

      if (isExpired) {
        return `${formattedDate} (Expired)`;
      }

      const timeLeft = Math.max(
        0,
        Math.floor((expiresAt.getTime() - now.getTime()) / 60000),
      );
      return `${formattedDate} (${timeLeft}m left)`;
    }
    return `${formattedDate} (Indefinite)`;
  };

  const getReservationStatusColor = (
    reservedAt: string,
    durationMinutes?: number,
  ) => {
    if (!durationMinutes) return 'primary'; // Indefinite

    const reservedDate = new Date(reservedAt);
    const expiresAt = new Date(
      reservedDate.getTime() + durationMinutes * 60000,
    );
    const now = new Date();
    const timeLeft = Math.max(
      0,
      Math.floor((expiresAt.getTime() - now.getTime()) / 60000),
    );

    if (timeLeft === 0) return 'danger'; // Expired
    if (timeLeft < 30) return 'warning'; // Expiring soon
    return 'success'; // Active
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
      <Typography level="h2">Machine Reservations</Typography>

      {/* Status Overview */}
      <Grid container spacing={2}>
        <Grid xs={4}>
          <Card variant="soft" color="primary">
            <CardContent>
              <Typography level="title-lg" startDecorator={<Lock />}>
                Total Reserved
              </Typography>
              <Typography level="h2">{allReservations.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={4}>
          <Card variant="soft" color="success">
            <CardContent>
              <Typography level="title-lg" startDecorator={<User />}>
                My Reservations
              </Typography>
              <Typography level="h2">{myReservations.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={4}>
          <Card variant="soft" color="warning">
            <CardContent>
              <Typography level="title-lg" startDecorator={<Clock />}>
                Active Hosts
              </Typography>
              <Typography level="h2">
                {Object.keys(reservationsByHost).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Actions */}
      <Stack direction="row" spacing={2}>
        <Button
          variant="outlined"
          startDecorator={<AlertTriangle />}
          onClick={() => setCleanupModalOpen(true)}
        >
          Cleanup Expired
        </Button>
        <Button
          variant="outlined"
          startDecorator={<RefreshCw />}
          onClick={() => {
            mutateReservations();
            mutateMyReservations();
          }}
        >
          Refresh
        </Button>
      </Stack>

      {/* My Reservations */}
      <Typography level="h3">My Reservations</Typography>
      {myReservations.length > 0 ? (
        <Sheet sx={{ overflow: 'auto' }}>
          <Table borderAxis="both">
            <thead>
              <tr>
                <th>Machine Name</th>
                <th>Reserved At</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {myReservations.map((reservation) => (
                <tr
                  key={`${reservation.machine_id}-${reservation.reserved_at}`}
                >
                  <td>
                    <Typography level="body-md" fontWeight="md">
                      {reservation.machine_name}
                    </Typography>
                  </td>
                  <td>
                    <Typography level="body-sm">
                      {new Date(reservation.reserved_at).toLocaleString()}
                    </Typography>
                  </td>
                  <td>
                    <Typography level="body-sm">
                      {reservation.duration_minutes
                        ? `${reservation.duration_minutes} minutes`
                        : 'Indefinite'}
                    </Typography>
                  </td>
                  <td>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={getReservationStatusColor(
                        reservation.reserved_at,
                        reservation.duration_minutes,
                      )}
                    >
                      {formatReservationTime(
                        reservation.reserved_at,
                        reservation.duration_minutes,
                      ).includes('Expired')
                        ? 'Expired'
                        : formatReservationTime(
                              reservation.reserved_at,
                              reservation.duration_minutes,
                            ).includes('left')
                          ? 'Active'
                          : 'Indefinite'}
                    </Chip>
                  </td>
                  <td>
                    <Typography level="body-sm">
                      {reservation.metadata?.purpose || '-'}
                    </Typography>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Sheet>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography level="body-lg" color="neutral">
            No current reservations
          </Typography>
        </Box>
      )}

      {/* All Reservations by Host */}
      <Typography level="h3">All Reservations by Host</Typography>
      {Object.keys(reservationsByHost).length > 0 ? (
        <Stack spacing={2}>
          {Object.entries(reservationsByHost).map(([hostId, reservations]) => (
            <Card key={hostId} variant="outlined">
              <CardContent>
                <Typography level="title-md" startDecorator={<User />}>
                  Host: {hostId.split(':')[0]} ({reservations.length}{' '}
                  reservation{reservations.length !== 1 ? 's' : ''})
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Stack spacing={1}>
                  {reservations.map((reservation) => (
                    <Card
                      key={`${reservation.machine_id}-${reservation.reserved_at}`}
                      variant="soft"
                      size="sm"
                    >
                      <CardContent orientation="horizontal">
                        <Box sx={{ flex: 1 }}>
                          <Typography level="body-sm" fontWeight="md">
                            {reservation.machine_name}
                          </Typography>
                          <Typography level="body-xs" color="neutral">
                            {formatReservationTime(
                              reservation.reserved_at,
                              reservation.duration_minutes,
                            )}
                          </Typography>
                        </Box>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={getReservationStatusColor(
                            reservation.reserved_at,
                            reservation.duration_minutes,
                          )}
                          startDecorator={<Lock />}
                        >
                          Reserved
                        </Chip>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography level="body-lg" color="neutral">
            No active reservations from any host
          </Typography>
        </Box>
      )}

      {/* Cleanup Confirmation Modal */}
      <Modal open={cleanupModalOpen} onClose={() => setCleanupModalOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <Typography level="h4" mb={2}>
            Cleanup Expired Reservations
          </Typography>

          <Typography level="body-md" mb={3}>
            This will remove all expired reservations from the system. Are you
            sure you want to continue?
          </Typography>

          <Stack direction="row" spacing={2} sx={{ pt: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setCleanupModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCleanupExpiredReservations}
              loading={isSubmitting}
              startDecorator={<AlertTriangle />}
              color="warning"
            >
              Cleanup Expired
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
