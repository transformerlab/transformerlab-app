import {
  Box,
  Typography,
  Stack,
  Card,
  CircularProgress,
  Table,
} from '@mui/joy';
import { useState, useEffect } from 'react';
import { useAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function QuotaReportSection() {
  const { fetchWithAuth } = useAuth();
  const authContext = useAuth();
  const [quotaStatus, setQuotaStatus] = useState<any>(null);
  const [quotaUsage, setQuotaUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuota = async () => {
      if (!authContext.team?.id) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [statusRes, usageRes] = await Promise.all([
          fetchWithAuth(chatAPI.Endpoints.Quota.GetMyStatus()),
          fetchWithAuth(chatAPI.Endpoints.Quota.GetMyUsage()),
        ]);

        if (statusRes.ok) {
          const status = await statusRes.json();
          setQuotaStatus(status);
        }
        if (usageRes.ok) {
          const usage = await usageRes.json();
          setQuotaUsage(usage || []);
        }
      } catch (error) {
        console.error('Error fetching quota:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuota();
  }, [authContext.team?.id, fetchWithAuth]);

  if (!authContext.team?.id) {
    return null;
  }

  if (loading) {
    return (
      <Box mt={4}>
        <Typography level="title-lg">Quota Report</Typography>
        <CircularProgress />
      </Box>
    );
  }

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes.toFixed(1)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const percentage = quotaStatus?.total_quota
    ? (quotaStatus.used_quota / quotaStatus.total_quota) * 100
    : 0;

  return (
    <Box mt={4}>
      <Typography level="title-lg" mb={2}>
        Quota Report
      </Typography>
      <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Box>
            <Typography level="body-sm" color="neutral">
              Current Period:{' '}
              {quotaStatus?.current_period_start
                ? formatDate(quotaStatus.current_period_start)
                : 'N/A'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={4}>
            <Box>
              <Typography level="body-sm" color="neutral">
                Team Quota
              </Typography>
              <Typography level="title-md">
                {formatMinutes(quotaStatus?.team_quota || 0)}
              </Typography>
            </Box>
            {quotaStatus?.user_override > 0 && (
              <Box>
                <Typography level="body-sm" color="neutral">
                  Your Override
                </Typography>
                <Typography level="title-md">
                  +{formatMinutes(quotaStatus.user_override)}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography level="body-sm" color="neutral">
                Total Available
              </Typography>
              <Typography level="title-md">
                {formatMinutes(quotaStatus?.total_quota || 0)}
              </Typography>
            </Box>
            <Box>
              <Typography level="body-sm" color="neutral">
                Used
              </Typography>
              <Typography level="title-md" color="warning">
                {formatMinutes(quotaStatus?.used_quota || 0)}
              </Typography>
            </Box>
            <Box>
              <Typography level="body-sm" color="neutral">
                Held (Pending)
              </Typography>
              <Typography level="title-md" color="neutral">
                {formatMinutes(quotaStatus?.held_quota || 0)}
              </Typography>
            </Box>
            <Box>
              <Typography level="body-sm" color="neutral">
                Remaining
              </Typography>
              <Typography
                level="title-md"
                color={
                  quotaStatus?.available_quota < 0 ? 'danger' : 'success'
                }
              >
                {formatMinutes(quotaStatus?.available_quota || 0)}
              </Typography>
            </Box>
          </Stack>
          {quotaStatus?.total_quota > 0 && (
            <Box>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                mb={0.5}
              >
                <Typography level="body-xs" color="neutral">
                  Usage Progress
                </Typography>
                <Typography level="body-xs" color="neutral">
                  {percentage.toFixed(1)}%
                </Typography>
              </Stack>
              <Box
                sx={{
                  height: 8,
                  bgcolor: 'background.level2',
                  borderRadius: 'sm',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: `${Math.min(percentage, 100)}%`,
                    bgcolor:
                      percentage > 90
                        ? 'danger.500'
                        : percentage > 75
                          ? 'warning.500'
                          : 'primary.500',
                    transition: 'width 0.3s ease',
                  }}
                />
              </Box>
            </Box>
          )}
        </Stack>
      </Card>

      {quotaUsage.length > 0 && (
        <Box>
          <Typography level="title-md" mb={1}>
            Recent Usage History
          </Typography>
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Minutes Used</th>
                <th>Job ID</th>
                <th>Experiment ID</th>
              </tr>
            </thead>
            <tbody>
              {quotaUsage.slice(0, 10).map((record: any) => (
                <tr key={record.id}>
                  <td>{formatDate(record.created_at)}</td>
                  <td>{formatMinutes(record.minutes_used)}</td>
                  <td>
                    <Typography
                      level="body-xs"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {record.job_id || 'N/A'}
                    </Typography>
                  </td>
                  <td>
                    <Typography
                      level="body-xs"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {record.experiment_id || 'N/A'}
                    </Typography>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>
      )}
    </Box>
  );
}

