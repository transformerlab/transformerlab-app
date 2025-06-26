import React from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { Lock } from 'lucide-react';

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

interface QuotaUsage {
  minutes_used: number;
  minutes_limit: number;
  remaining_minutes: number;
  usage_percent: number;
  period_start_date: string;
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

interface ReservationModalProps {
  open: boolean;
  onClose: () => void;
  selectedMachine: NetworkMachine | null;
  reservationData: {
    duration_minutes: number;
    purpose: string;
  };
  setReservationData: React.Dispatch<
    React.SetStateAction<{
      duration_minutes: number;
      purpose: string;
    }>
  >;
  quotaCheckData: QuotaCheckResult | null;
  isSubmitting: boolean;
  handleCheckQuota: (duration: number) => void;
  handleReserveMachine: (machineId: number) => void;
}

export default function ReservationModal({
  open,
  onClose,
  selectedMachine,
  reservationData,
  setReservationData,
  quotaCheckData,
  isSubmitting,
  handleCheckQuota,
  handleReserveMachine,
}: ReservationModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: { xs: '90vw', sm: '500px' },
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
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
                  <Alert variant="soft" color="danger" size="sm" sx={{ mb: 1 }}>
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
                  <Alert variant="soft" color="danger" size="sm" sx={{ mb: 1 }}>
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
                      <Typography key={period} level="body-xs" color="neutral">
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
              onClick={onClose}
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
  );
}
