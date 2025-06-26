import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
  Select,
  Option,
  FormControl,
  FormLabel,
  Grid,
  Chip,
  Divider,
} from '@mui/joy';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveRadar } from '@nivo/radar';
import {
  BarChart3,
  TrendingUp,
  Activity,
  RefreshCw,
  Download,
} from 'lucide-react';
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

interface DashboardData {
  reservationsByHost: Array<{
    host: string;
    reservations: number;
    totalMinutes: number;
    activeReservations: number;
  }>;
  reservationsByMachine: Array<{
    machine: string;
    reservations: number;
    totalMinutes: number;
    avgDuration: number;
  }>;
  usageOverTime: Array<{
    date: string;
    reservations: number;
    minutes: number;
  }>;
  quotaUtilization: Array<{
    host: string;
    daily: number;
    weekly: number;
    monthly: number;
  }>;
}

interface NetworkDashboardModalProps {
  open: boolean;
  onClose: () => void;
  machines: NetworkMachine[];
}

function NetworkDashboardModal({
  open,
  onClose,
  machines,
}: NetworkDashboardModalProps) {
  const [chartType, setChartType] = useState('bar');
  const [timeRange, setTimeRange] = useState('7d');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);

  // Fetch dashboard analytics data
  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      // Convert time range string to number of days
      let timeRangeDays;
      if (timeRange === '7d') {
        timeRangeDays = 7;
      } else if (timeRange === '30d') {
        timeRangeDays = 30;
      } else {
        timeRangeDays = 90;
      }

      const apiUrl = getFullPath('network', ['dashboardAnalytics'], {});
      // eslint-disable-next-line no-console
      console.log('Calling API:', apiUrl);
      // eslint-disable-next-line no-console
      console.log('Request body:', { time_range: timeRangeDays });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          time_range: timeRangeDays,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // eslint-disable-next-line no-console
        console.log('Dashboard API Response:', result);
        if (result.status === 'success' && result.data) {
          // eslint-disable-next-line no-console
          console.log('Dashboard Data:', result.data);
          // eslint-disable-next-line no-console
          console.log('Quota Utilization:', result.data.quotaUtilization);
          setDashboardData(result.data);
        } else {
          // eslint-disable-next-line no-console
          console.log('API response invalid:', result);
          setDashboardData(null);
        }
      } else {
        // Handle API error - no data received
        // eslint-disable-next-line no-console
        console.log(
          'API request failed:',
          response.status,
          response.statusText,
        );
        setDashboardData(null);
      }
    } catch (error) {
      // Handle network error
      // eslint-disable-next-line no-console
      console.log('Network error:', error);
      setDashboardData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, timeRange]);

  const getQuotaColor = (percentage: number) => {
    if (percentage >= 90) return '#ff4757';
    if (percentage >= 75) return '#ffa502';
    if (percentage >= 50) return '#ff6348';
    return '#2ed573';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${remainingMins}m`;
    }
    return `${minutes}m`;
  };

  const renderChart = () => {
    if (!dashboardData) return null;

    switch (chartType) {
      case 'bar':
        return (
          <Box sx={{ height: 400 }}>
            <ResponsiveBar
              data={dashboardData.reservationsByHost}
              keys={['reservations', 'activeReservations']}
              indexBy="host"
              margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
              padding={0.3}
              valueScale={{ type: 'linear' }}
              indexScale={{ type: 'band', round: true }}
              colors={{ scheme: 'nivo' }}
              borderColor={{
                from: 'color',
                modifiers: [['darker', 1.6]],
              }}
              axisTop={null}
              axisRight={null}
              axisBottom={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: -45,
                legend: 'Host',
                legendPosition: 'middle',
                legendOffset: 40,
              }}
              axisLeft={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: 'Count',
                legendPosition: 'middle',
                legendOffset: -40,
              }}
              labelSkipWidth={12}
              labelSkipHeight={12}
              labelTextColor={{
                from: 'color',
                modifiers: [['darker', 1.6]],
              }}
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
                  effects: [
                    {
                      on: 'hover',
                      style: {
                        itemOpacity: 1,
                      },
                    },
                  ],
                },
              ]}
              role="application"
              ariaLabel="Reservations by host chart"
            />
          </Box>
        );

      case 'line':
        return (
          <Box sx={{ height: 400 }}>
            <ResponsiveLine
              data={[
                {
                  id: 'reservations',
                  color: '#3b82f6',
                  data: dashboardData.usageOverTime.map((d) => ({
                    x: d.date,
                    y: d.reservations,
                  })),
                },
                {
                  id: 'minutes',
                  color: '#ef4444',
                  data: dashboardData.usageOverTime.map((d) => ({
                    x: d.date,
                    y: Math.floor(d.minutes / 60), // Convert to hours for better scale
                  })),
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
              yFormat=" >-.2f"
              axisTop={null}
              axisRight={null}
              axisBottom={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: -45,
                legend: 'Date',
                legendOffset: 40,
                legendPosition: 'middle',
              }}
              axisLeft={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: 'Count / Hours',
                legendOffset: -40,
                legendPosition: 'middle',
              }}
              pointSize={10}
              pointColor={{ theme: 'background' }}
              pointBorderWidth={2}
              pointBorderColor={{ from: 'serieColor' }}
              pointLabelYOffset={-12}
              useMesh
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
                  symbolBorderColor: 'rgba(0, 0, 0, .5)',
                  effects: [
                    {
                      on: 'hover',
                      style: {
                        itemBackground: 'rgba(0, 0, 0, .03)',
                        itemOpacity: 1,
                      },
                    },
                  ],
                },
              ]}
            />
          </Box>
        );

      case 'radar':
        return (
          <Box sx={{ height: 400 }}>
            <ResponsiveRadar
              data={dashboardData.quotaUtilization}
              keys={['daily', 'weekly', 'monthly']}
              indexBy="host"
              valueFormat=">-.0f"
              margin={{ top: 70, right: 80, bottom: 40, left: 80 }}
              borderColor={{ from: 'color' }}
              gridLabelOffset={36}
              dotSize={10}
              dotColor={{ theme: 'background' }}
              dotBorderWidth={2}
              colors={{ scheme: 'nivo' }}
              blendMode="multiply"
              motionConfig="wobbly"
              legends={[
                {
                  anchor: 'top-left',
                  direction: 'column',
                  translateX: -50,
                  translateY: -40,
                  itemWidth: 80,
                  itemHeight: 20,
                  itemTextColor: '#999',
                  symbolSize: 12,
                  symbolShape: 'circle',
                  effects: [
                    {
                      on: 'hover',
                      style: {
                        itemTextColor: '#000',
                      },
                    },
                  ],
                },
              ]}
            />
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        size="lg"
        sx={{
          width: { xs: '95vw', sm: '90vw', md: '1200px' },
          maxWidth: '1200px',
          height: { xs: '90vh', sm: '85vh' },
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Typography level="h3" startDecorator={<BarChart3 />} sx={{ mb: 2 }}>
          Network Usage Dashboard
        </Typography>

        {/* Controls */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ mb: 3 }}
        >
          <FormControl sx={{ minWidth: 120 }}>
            <FormLabel>Chart Type</FormLabel>
            <Select
              value={chartType}
              onChange={(_, newValue) => setChartType(newValue as string)}
            >
              <Option value="bar">Bar Chart</Option>
              <Option value="line">Line Chart</Option>
              <Option value="radar">Radar Chart</Option>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 120 }}>
            <FormLabel>Time Range</FormLabel>
            <Select
              value={timeRange}
              onChange={(_, newValue) => setTimeRange(newValue as string)}
            >
              <Option value="7d">Last 7 Days</Option>
              <Option value="30d">Last 30 Days</Option>
              <Option value="90d">Last 90 Days</Option>
            </Select>
          </FormControl>

          <Stack direction="row" spacing={1} sx={{ alignSelf: 'end' }}>
            <Button
              variant="outlined"
              startDecorator={<RefreshCw />}
              onClick={fetchDashboardData}
              size="sm"
            >
              Refresh
            </Button>
            <Button
              variant="outlined"
              startDecorator={<Download />}
              size="sm"
              onClick={() => {
                // TODO: Implement export functionality
              }}
            >
              Export
            </Button>
          </Stack>
        </Stack>

        {/* Main Content */}
        <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: 200,
              }}
            >
              <Typography>Loading dashboard data...</Typography>
            </Box>
          ) : (
            <Stack spacing={3}>
              {/* Summary Cards */}
              {dashboardData && (
                <Grid container spacing={2}>
                  <Grid xs={12} sm={6} md={3}>
                    <Card variant="soft" color="primary">
                      <CardContent>
                        <Typography level="title-md">Total Machines</Typography>
                        <Typography level="h2">{machines.length}</Typography>
                        <Typography level="body-sm" color="neutral">
                          Configured machines
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} sm={6} md={3}>
                    <Card variant="soft" color="success">
                      <CardContent>
                        <Typography level="title-md">Active Hosts</Typography>
                        <Typography level="h2">
                          {dashboardData.reservationsByHost.length}
                        </Typography>
                        <Typography level="body-sm" color="neutral">
                          Making reservations
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} sm={6} md={3}>
                    <Card variant="soft" color="warning">
                      <CardContent>
                        <Typography level="title-md">
                          Total Reservations
                        </Typography>
                        <Typography level="h2">
                          {dashboardData.reservationsByHost.reduce(
                            (sum, host) => sum + host.reservations,
                            0,
                          )}
                        </Typography>
                        <Typography level="body-sm" color="neutral">
                          All time
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} sm={6} md={3}>
                    <Card variant="soft" color="danger">
                      <CardContent>
                        <Typography level="title-md">Total Hours</Typography>
                        <Typography level="h2">
                          {formatNumber(
                            Math.floor(
                              dashboardData.reservationsByHost.reduce(
                                (sum, host) => sum + host.totalMinutes,
                                0,
                              ) / 60,
                            ),
                          )}
                        </Typography>
                        <Typography level="body-sm" color="neutral">
                          Reserved time
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              )}

              {/* Chart */}
              <Card>
                <CardContent>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                  >
                    <Typography level="h4" startDecorator={<TrendingUp />}>
                      {chartType === 'bar' && 'Reservations by Host'}
                      {chartType === 'line' && 'Usage Over Time'}
                      {chartType === 'radar' && 'Quota Utilization'}
                    </Typography>
                    <Chip
                      color="primary"
                      variant="soft"
                      startDecorator={<Activity />}
                    >
                      {timeRange.toUpperCase()}
                    </Chip>
                  </Stack>
                  <Divider sx={{ mb: 2 }} />
                  {renderChart()}
                </CardContent>
              </Card>

              {/* Detailed Tables */}
              {dashboardData && (
                <Grid container spacing={2}>
                  <Grid xs={12} md={6}>
                    <Card>
                      <CardContent>
                        <Typography level="h4" sx={{ mb: 2 }}>
                          Top Machines by Usage
                        </Typography>
                        <Stack spacing={1}>
                          {dashboardData.reservationsByMachine
                            .sort((a, b) => b.totalMinutes - a.totalMinutes)
                            .slice(0, 5)
                            .map((machine) => (
                              <Stack
                                key={machine.machine}
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                                sx={{
                                  p: 1,
                                  borderRadius: 'sm',
                                  bgcolor: 'background.level1',
                                }}
                              >
                                <Stack>
                                  <Typography level="body-md" fontWeight="md">
                                    {machine.machine}
                                  </Typography>
                                  <Typography level="body-xs" color="neutral">
                                    Avg: {formatMinutes(machine.avgDuration)}
                                  </Typography>
                                </Stack>
                                <Stack alignItems="end">
                                  <Typography level="body-sm" fontWeight="md">
                                    {formatMinutes(machine.totalMinutes)}
                                  </Typography>
                                  <Typography level="body-xs" color="neutral">
                                    {machine.reservations} reservations
                                  </Typography>
                                </Stack>
                              </Stack>
                            ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <Card>
                      <CardContent>
                        <Typography level="h4" sx={{ mb: 2 }}>
                          Host Quota Status
                        </Typography>
                        <Stack spacing={1}>
                          {dashboardData.quotaUtilization.map((quota) => (
                            <Stack
                              key={quota.host}
                              spacing={1}
                              sx={{
                                p: 1,
                                borderRadius: 'sm',
                                bgcolor: 'background.level1',
                              }}
                            >
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                              >
                                <Typography level="body-md" fontWeight="md">
                                  {quota.host}
                                </Typography>
                                <Chip
                                  size="sm"
                                  variant="soft"
                                  sx={{
                                    bgcolor: getQuotaColor(quota.daily),
                                    color: 'white',
                                  }}
                                >
                                  {quota.daily.toFixed(1)}%
                                </Chip>
                              </Stack>
                              <Stack direction="row" spacing={2}>
                                <Typography level="body-xs" color="neutral">
                                  Weekly: {quota.weekly.toFixed(1)}%
                                </Typography>
                                <Typography level="body-xs" color="neutral">
                                  Monthly: {quota.monthly.toFixed(1)}%
                                </Typography>
                              </Stack>
                            </Stack>
                          ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              )}
            </Stack>
          )}
        </Box>
      </ModalDialog>
    </Modal>
  );
}

export default NetworkDashboardModal;
