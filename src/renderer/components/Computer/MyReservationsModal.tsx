import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { Clock, Lock, Unlock } from 'lucide-react';
import { getFullPath } from 'renderer/lib/transformerlab-api-sdk';

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

interface MyReservationsModalProps {
  open: boolean;
  onClose: () => void;
  myReservationsData: NetworkMachine[];
  setMyReservationsData: React.Dispatch<React.SetStateAction<NetworkMachine[]>>;
}

export default function MyReservationsModal({
  open,
  onClose,
  myReservationsData,
  setMyReservationsData,
}: MyReservationsModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        size="lg"
        sx={{
          width: { xs: '95vw', sm: '90vw', md: '800px' },
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
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
                      const remainingMs = expiryTime.getTime() - now.getTime();
                      const remainingMinutes = Math.max(
                        0,
                        Math.floor(remainingMs / 60000),
                      );

                      if (remainingMinutes < 60) return `${remainingMinutes}m`;
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
                              CPU: %
                            </Typography>
                          </Grid>
                          <Grid xs={4}>
                            <Typography level="body-xs" color="neutral">
                              Memory: %
                            </Typography>
                          </Grid>
                          <Grid xs={4}>
                            <Typography level="body-xs" color="neutral">
                              GPUs:
                            </Typography>
                          </Grid>
                        </Grid>

                        {machine.machine_metadata.last_server_info.gpu?.length >
                          0 && (
                          <Box sx={{ mt: 1 }}>
                            <Typography level="body-xs" color="neutral">
                              GPU:{' '}
                              {
                                machine.machine_metadata.last_server_info.gpu[0]
                                  ?.name
                              }
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}

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
  );
}
