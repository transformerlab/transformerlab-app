import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { AlertTriangle } from 'lucide-react';

interface QuotaUsage {
  minutes_used: number;
  minutes_limit: number;
  remaining_minutes: number;
  usage_percent: number;
  period_start_date: string;
  is_warning: boolean;
  is_exceeded: boolean;
}

interface QuotaDetailsModalProps {
  open: boolean;
  onClose: () => void;
  quotaUsageData: { [key: string]: QuotaUsage } | null;
  getQuotaColor: (
    percent: number,
  ) => 'primary' | 'warning' | 'danger' | 'success';
}

export default function QuotaDetailsModal({
  open,
  onClose,
  quotaUsageData,
  getQuotaColor,
}: QuotaDetailsModalProps) {
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
          Quota Details
        </Typography>

        {quotaUsageData && Object.keys(quotaUsageData).length > 0 ? (
          <Stack spacing={3}>
            {Object.entries(quotaUsageData).map(([period, usage]) => {
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
  );
}
