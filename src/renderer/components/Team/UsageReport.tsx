import {
  Box,
  Button,
  Typography,
  Sheet,
  Stack,
  Table,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Chip,
} from '@mui/joy';
import {
  ArrowLeftIcon,
  BarChart3Icon,
  UsersIcon,
  ServerIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI } from 'renderer/lib/authContext';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

interface UsageData {
  summary: {
    total_jobs: number;
    total_users: number;
    total_providers: number;
  };
  by_user: Array<{
    user_email: string;
    user_name: string;
    total_jobs: number;
    total_duration_seconds: number;
    jobs: any[];
  }>;
  by_provider: Array<{
    provider_name: string;
    provider_type: string;
    provider_exists?: boolean;
    total_jobs: number;
    total_duration_seconds: number;
    jobs: any[];
  }>;
  all_jobs: any[];
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds === 0) return '0s';

  const dur = dayjs.duration(seconds, 'seconds');
  const hours = Math.floor(dur.asHours());
  const minutes = dur.minutes();
  const secs = dur.seconds();

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export default function UsageReport(): JSX.Element {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useAPI('compute_provider', [
    'usage-report',
  ]);
  const usageData = data as UsageData | undefined;

  if (isLoading) {
    return (
      <Sheet
        sx={{
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <Stack direction="column" alignItems="center" gap={2}>
          <CircularProgress />
          <Typography>Loading usage data...</Typography>
        </Stack>
      </Sheet>
    );
  }

  if (error) {
    // Check if it's a 403 error (forbidden - not an owner)
    const isForbidden =
      (error as any)?.status === 403 ||
      (error as any)?.response?.detail?.includes('owner') ||
      (error as any)?.response?.detail?.includes('Only team owners');

    return (
      <Sheet sx={{ overflowY: 'auto', p: 2 }}>
        <Alert color="danger">
          {isForbidden ? (
            <>
              <Typography level="title-md" mb={1}>
                Access Restricted
              </Typography>
              <Typography>
                Only team owners can view the usage report. Please contact a
                team owner to access this information.
              </Typography>
            </>
          ) : (
            <>
              Error loading usage data:{' '}
              {error instanceof Error ? error.message : 'Unknown error'}
            </>
          )}
        </Alert>
        <Button
          variant="outlined"
          onClick={() => navigate('/team')}
          startDecorator={<ArrowLeftIcon />}
          sx={{ mt: 2 }}
        >
          Back to Team Settings
        </Button>
      </Sheet>
    );
  }

  if (!usageData) {
    return (
      <Sheet sx={{ overflowY: 'auto', p: 2 }}>
        <Alert>No usage data available.</Alert>
      </Sheet>
    );
  }

  // Prepare data for charts
  const userChartData = usageData.by_user.slice(0, 10).map((user) => ({
    user: user.user_name || user.user_email,
    duration: Math.round(user.total_duration_seconds / 60), // Convert to minutes
    jobs: user.total_jobs,
  }));

  const providerChartData = usageData.by_provider
    .slice(0, 10)
    .map((provider) => ({
      provider: provider.provider_name, // Already includes "(Deleted)" if deleted
      duration: Math.round(provider.total_duration_seconds / 60), // Convert to minutes
      jobs: provider.total_jobs,
    }));

  // Time series data (jobs over time)
  const timeSeriesData: { [key: string]: number } = {};
  usageData.all_jobs.forEach((job) => {
    if (job.start_time) {
      try {
        const date = dayjs(job.start_time).format('YYYY-MM-DD');
        timeSeriesData[date] = (timeSeriesData[date] || 0) + 1;
      } catch (e) {
        // Skip invalid dates
      }
    }
  });

  const timeSeriesChartData = Object.entries(timeSeriesData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      x: date,
      y: count,
    }));

  return (
    <Sheet sx={{ overflowY: 'auto', p: 2 }}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button
          variant="outlined"
          onClick={() => navigate('/team')}
          startDecorator={<ArrowLeftIcon />}
        >
          Back to Team Settings
        </Button>
        <Typography level="h2">Usage Report</Typography>
      </Stack>

      {/* Summary Cards */}
      <Stack direction="row" gap={2} mb={4} sx={{ flexWrap: 'wrap' }}>
        <Card variant="outlined" sx={{ minWidth: 200, flex: 1 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" gap={1} mb={1}>
              <BarChart3Icon size={20} />
              <Typography level="title-md">Total Jobs</Typography>
            </Stack>
            <Typography level="h2">{usageData.summary.total_jobs}</Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ minWidth: 200, flex: 1 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" gap={1} mb={1}>
              <UsersIcon size={20} />
              <Typography level="title-md">Total Users</Typography>
            </Stack>
            <Typography level="h2">{usageData.summary.total_users}</Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ minWidth: 200, flex: 1 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" gap={1} mb={1}>
              <ServerIcon size={20} />
              <Typography level="title-md">Providers</Typography>
            </Stack>
            <Typography level="h2">
              {usageData.summary.total_providers}
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* Usage by User Chart */}
      {userChartData.length > 0 && (
        <Box mb={4}>
          <Typography level="title-lg" mb={2}>
            Usage by User (Top 10)
          </Typography>
          <Card variant="outlined">
            <Box sx={{ height: 400, width: '100%' }}>
              <ResponsiveBar
                data={userChartData}
                keys={['duration']}
                indexBy="user"
                margin={{ top: 50, right: 130, bottom: 100, left: 80 }}
                padding={0.3}
                valueScale={{ type: 'linear' }}
                indexScale={{ type: 'band', round: true }}
                colors={{ scheme: 'nivo' }}
                axisTop={null}
                axisRight={null}
                axisBottom={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: -45,
                  legend: 'User',
                  legendPosition: 'middle',
                  legendOffset: 80,
                }}
                axisLeft={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Duration (minutes)',
                  legendPosition: 'middle',
                  legendOffset: -60,
                }}
                labelSkipWidth={12}
                labelSkipHeight={12}
                labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                legends={[
                  {
                    dataFrom: 'keys',
                    anchor: 'bottom-right',
                    direction: 'column',
                    justify: false,
                    translateX: 120,
                    translateY: 0,
                    itemsSpacing: 2,
                    itemWidth: 100,
                    itemHeight: 20,
                    itemDirection: 'left-to-right',
                    itemOpacity: 0.85,
                    symbolSize: 20,
                  },
                ]}
                role="application"
                ariaLabel="Usage by user chart"
                barAriaLabel={(e) => `${e.id}: ${e.formattedValue} minutes`}
              />
            </Box>
          </Card>
        </Box>
      )}

      {/* Usage by Provider Chart */}
      {providerChartData.length > 0 && (
        <Box mb={4}>
          <Typography level="title-lg" mb={2}>
            Usage by Provider (Top 10)
          </Typography>
          <Card variant="outlined">
            <Box sx={{ height: 400, width: '100%' }}>
              <ResponsiveBar
                data={providerChartData}
                keys={['duration']}
                indexBy="provider"
                margin={{ top: 50, right: 130, bottom: 100, left: 80 }}
                padding={0.3}
                valueScale={{ type: 'linear' }}
                indexScale={{ type: 'band', round: true }}
                colors={{ scheme: 'set2' }}
                axisTop={null}
                axisRight={null}
                axisBottom={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: -45,
                  legend: 'Provider',
                  legendPosition: 'middle',
                  legendOffset: 80,
                }}
                axisLeft={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Duration (minutes)',
                  legendPosition: 'middle',
                  legendOffset: -60,
                }}
                labelSkipWidth={12}
                labelSkipHeight={12}
                labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                legends={[
                  {
                    dataFrom: 'keys',
                    anchor: 'bottom-right',
                    direction: 'column',
                    justify: false,
                    translateX: 120,
                    translateY: 0,
                    itemsSpacing: 2,
                    itemWidth: 100,
                    itemHeight: 20,
                    itemDirection: 'left-to-right',
                    itemOpacity: 0.85,
                    symbolSize: 20,
                  },
                ]}
                role="application"
                ariaLabel="Usage by provider chart"
                barAriaLabel={(e) => `${e.id}: ${e.formattedValue} minutes`}
              />
            </Box>
          </Card>
        </Box>
      )}

      {/* Jobs Over Time Chart */}
      {timeSeriesChartData.length > 0 && (
        <Box mb={4}>
          <Typography level="title-lg" mb={2}>
            Jobs Launched Over Time
          </Typography>
          <Card variant="outlined">
            <Box sx={{ height: 300, width: '100%' }}>
              <ResponsiveLine
                data={[
                  {
                    id: 'jobs',
                    color: 'hsl(221, 70%, 50%)',
                    data: timeSeriesChartData,
                  },
                ]}
                margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
                xScale={{ type: 'point' }}
                yScale={{
                  type: 'linear',
                  min: 'auto',
                  max: 'auto',
                  stacked: false,
                  reverse: false,
                }}
                yFormat=" >-.0f"
                axisTop={null}
                axisRight={null}
                axisBottom={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: -45,
                  legend: 'Date',
                  legendPosition: 'middle',
                  legendOffset: 50,
                }}
                axisLeft={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Number of Jobs',
                  legendPosition: 'middle',
                  legendOffset: -50,
                }}
                pointSize={10}
                pointColor={{ theme: 'background' }}
                pointBorderWidth={2}
                pointBorderColor={{ from: 'serieColor' }}
                pointLabelYOffset={-12}
                useMesh={true}
                legends={[
                  {
                    anchor: 'bottom-right',
                    direction: 'column',
                    justify: false,
                    translateX: 100,
                    translateY: 0,
                    itemsSpacing: 0,
                    itemDirection: 'left-to-right',
                    itemWidth: 80,
                    itemHeight: 20,
                    itemOpacity: 0.75,
                    symbolSize: 12,
                    symbolShape: 'circle',
                  },
                ]}
              />
            </Box>
          </Card>
        </Box>
      )}

      {/* Detailed Table by User */}
      <Box mb={4}>
        <Typography level="title-lg" mb={2}>
          Detailed Usage by User
        </Typography>
        <Table variant="soft" sx={{ mb: 2 }}>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Total Jobs</th>
              <th>Total Duration</th>
            </tr>
          </thead>
          <tbody>
            {usageData.by_user.map((user) => (
              <tr key={user.user_email}>
                <td>{user.user_name}</td>
                <td>{user.user_email}</td>
                <td>{user.total_jobs}</td>
                <td>{formatDuration(user.total_duration_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Box>

      {/* Detailed Table by Provider */}
      <Box mb={4}>
        <Typography level="title-lg" mb={2}>
          Detailed Usage by Provider
        </Typography>
        <Table variant="soft" sx={{ mb: 2 }}>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Type</th>
              <th>Total Jobs</th>
              <th>Total Duration</th>
            </tr>
          </thead>
          <tbody>
            {usageData.by_provider.map((provider) => (
              <tr key={provider.provider_name}>
                <td>
                  <Stack direction="row" alignItems="center" gap={1}>
                    {provider.provider_name}
                    {provider.provider_exists === false && (
                      <Chip size="sm" color="neutral" variant="soft">
                        Deleted
                      </Chip>
                    )}
                  </Stack>
                </td>
                <td>{provider.provider_type || 'Unknown'}</td>
                <td>{provider.total_jobs}</td>
                <td>{formatDuration(provider.total_duration_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Box>
    </Sheet>
  );
}
