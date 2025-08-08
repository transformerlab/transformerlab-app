import * as React from 'react';
import {
  Button,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Select,
  Option,
  Table,
  Typography,
  Sheet,
  Chip,
  Box,
} from '@mui/joy';
import { RotateCcwIcon, Server, Clock, Zap } from 'lucide-react';
import { useNotification } from '../../Shared/NotificationSystem';

interface ClusterStatus {
  cluster_name: string;
  status: string;
  launched_at?: number;
  last_use?: string;
  autostop?: number;
  to_down?: boolean;
  resources_str?: string;
}

interface StatusResponse {
  clusters: ClusterStatus[];
}

interface ClusterTypeInfo {
  cluster_name: string;
  cluster_type: string;
  is_ssh: boolean;
  available_operations: string[];
  recommendations: {
    stop: string;
    down: string;
  };
}

interface JobRecord {
  job_id: number;
  job_name: string;
  username: string;
  submitted_at: number;
  start_at?: number;
  end_at?: number;
  resources: string;
  status: string;
  log_path: string;
}

interface JobQueueResponse {
  jobs: JobRecord[];
}

interface ActiveClustersProps {
  latticeApiUrl?: string;
  latticeApiKey?: string;
}

export default function ActiveClusters({
  latticeApiUrl = '',
  latticeApiKey = '',
}: ActiveClustersProps) {
  const { addNotification } = useNotification();
  const [selectedCluster, setSelectedCluster] = React.useState<string>('');
  const [clustersLoading, setClustersLoading] = React.useState<boolean>(false);
  const [clusters, setClusters] = React.useState<ClusterStatus[]>([]);
  const [clusterType, setClusterType] = React.useState<ClusterTypeInfo | null>(
    null,
  );
  const [clusterJobs, setClusterJobs] = React.useState<JobRecord[]>([]);

  // Fetch active clusters function
  const fetchActiveClusters = React.useCallback(async () => {
    if (!latticeApiUrl || !latticeApiKey) return;

    setClustersLoading(true);
    try {
      const response = await fetch(`${latticeApiUrl}/api/v1/skypilot/status`, {
        headers: {
          Authorization: `Bearer ${latticeApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        addNotification({
          type: 'danger',
          message:
            'Authentication failed. Please check your API key in Settings.',
        });
        setClusters([]);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch active clusters (${response.status})`);
      }

      const data: StatusResponse = await response.json();
      setClusters(data.clusters || []);
    } catch (error) {
      addNotification({
        type: 'danger',
        message:
          'Failed to fetch active clusters. Please check your configuration.',
      });
      setClusters([]);
    } finally {
      setClustersLoading(false);
    }
  }, [latticeApiUrl, latticeApiKey, addNotification]);

  // Fetch cluster type information
  const fetchClusterType = React.useCallback(
    async (clusterName: string) => {
      if (!latticeApiUrl || !latticeApiKey || !clusterName) return;

      try {
        const response = await fetch(
          `${latticeApiUrl}/api/v1/skypilot/cluster-type/${clusterName}`,
          {
            headers: {
              Authorization: `Bearer ${latticeApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (response.status === 401) {
          addNotification({
            type: 'danger',
            message:
              'Authentication failed. Please check your API key in Settings.',
          });
          setClusterType(null);
          return;
        }

        if (!response.ok) {
          throw new Error(
            `Failed to fetch cluster type for ${clusterName} (${response.status})`,
          );
        }

        const data: ClusterTypeInfo = await response.json();
        setClusterType(data);
      } catch (error) {
        addNotification({
          type: 'warning',
          message: `Failed to fetch cluster type for ${clusterName}`,
        });
        setClusterType(null);
      }
    },
    [latticeApiUrl, latticeApiKey, addNotification],
  );

  // Fetch cluster jobs
  const fetchClusterJobs = React.useCallback(
    async (clusterName: string) => {
      if (!latticeApiUrl || !latticeApiKey || !clusterName) return;

      try {
        const response = await fetch(
          `${latticeApiUrl}/api/v1/skypilot/jobs/${clusterName}`,
          {
            headers: {
              Authorization: `Bearer ${latticeApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (response.status === 401) {
          addNotification({
            type: 'danger',
            message:
              'Authentication failed. Please check your API key in Settings.',
          });
          setClusterJobs([]);
          return;
        }

        if (!response.ok) {
          throw new Error(
            `Failed to fetch jobs for ${clusterName} (${response.status})`,
          );
        }

        const data: JobQueueResponse = await response.json();
        setClusterJobs(data.jobs || []);
      } catch (error) {
        addNotification({
          type: 'warning',
          message: `Failed to fetch jobs for ${clusterName}`,
        });
        setClusterJobs([]);
      }
    },
    [latticeApiUrl, latticeApiKey, addNotification],
  );

  // Fetch clusters when credentials are available
  React.useEffect(() => {
    if (latticeApiUrl && latticeApiKey) {
      fetchActiveClusters();
    }
  }, [latticeApiUrl, latticeApiKey, fetchActiveClusters]);

  // Fetch details when a cluster is selected
  React.useEffect(() => {
    if (selectedCluster) {
      fetchClusterType(selectedCluster);
      fetchClusterJobs(selectedCluster);
    } else {
      setClusterType(null);
      setClusterJobs([]);
    }
  }, [selectedCluster, fetchClusterType, fetchClusterJobs]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ClusterStatus.UP':
        return 'success';
      case 'ClusterStatus.INIT':
        return 'warning';
      case 'ClusterStatus.STOPPED':
        return 'neutral';
      default:
        return 'danger';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ClusterStatus.UP':
        return 'Running';
      case 'ClusterStatus.INIT':
        return 'Initializing';
      case 'ClusterStatus.STOPPED':
        return 'Stopped';
      default:
        return status;
    }
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getJobStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'RUNNING':
        return 'success';
      case 'PENDING':
        return 'warning';
      case 'COMPLETED':
        return 'primary';
      case 'FAILED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const currentCluster = clusters.find(
    (c) => c.cluster_name === selectedCluster,
  );

  if (!latticeApiUrl || !latticeApiKey) {
    return (
      <Sheet sx={{ p: 2 }}>
        <Typography level="body-lg" textAlign="center" color="neutral">
          Please configure Lattice API credentials in Settings to view Active
          Clusters.
        </Typography>
      </Sheet>
    );
  }

  return (
    <Sheet sx={{ p: 2 }}>
      <Typography level="h2" marginBottom={2}>
        Active Clusters (SkyPilot)
      </Typography>
      <Typography level="body-md" marginBottom={3} color="neutral">
        Manage and monitor your dynamically launched SkyPilot clusters that are
        currently running or stopped.
      </Typography>

      <FormControl sx={{ maxWidth: '500px', mb: 2 }}>
        <FormLabel>Select Active Cluster</FormLabel>
        {clustersLoading ? (
          <CircularProgress size="sm" />
        ) : (
          <Select
            placeholder="Choose an active cluster..."
            value={selectedCluster}
            onChange={(_, value) => setSelectedCluster(value || '')}
          >
            {clusters.map((cluster) => (
              <Option key={cluster.cluster_name} value={cluster.cluster_name}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Server size={16} />
                  {cluster.cluster_name}
                  <Chip
                    size="sm"
                    color={getStatusColor(cluster.status)}
                    variant="soft"
                  >
                    {getStatusText(cluster.status)}
                  </Chip>
                </Box>
              </Option>
            ))}
          </Select>
        )}
        <FormHelperText>
          {clusters.length === 0 && !clustersLoading
            ? 'No active clusters found. Check your API configuration.'
            : 'Select a cluster to view details and jobs'}
        </FormHelperText>
      </FormControl>

      <Button
        variant="soft"
        onClick={fetchActiveClusters}
        loading={clustersLoading}
        sx={{ mb: 3, maxWidth: '150px' }}
        startDecorator={<RotateCcwIcon size={16} />}
      >
        Refresh
      </Button>

      {/* Cluster Overview */}
      {selectedCluster && currentCluster && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Sheet
            variant="outlined"
            sx={{ p: 3, borderRadius: 'md', maxWidth: '800px', mb: 3 }}
          >
            <Typography level="title-lg" sx={{ mb: 2 }}>
              Cluster Overview: {selectedCluster}
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 2,
                mb: 3,
              }}
            >
              <Box>
                <Typography level="body-sm" color="neutral">
                  Status
                </Typography>
                <Chip
                  color={getStatusColor(currentCluster.status)}
                  variant="soft"
                  sx={{ mt: 0.5 }}
                >
                  {getStatusText(currentCluster.status)}
                </Chip>
              </Box>

              <Box>
                <Typography level="body-sm" color="neutral">
                  Resources
                </Typography>
                <Typography level="body-md" sx={{ mt: 0.5 }}>
                  {currentCluster.resources_str || 'N/A'}
                </Typography>
              </Box>

              <Box>
                <Typography level="body-sm" color="neutral">
                  Launched At
                </Typography>
                <Typography level="body-md" sx={{ mt: 0.5 }}>
                  {formatTimestamp(currentCluster.launched_at)}
                </Typography>
              </Box>

              <Box>
                <Typography level="body-sm" color="neutral">
                  Last Use
                </Typography>
                <Typography level="body-md" sx={{ mt: 0.5 }}>
                  {currentCluster.last_use || 'N/A'}
                </Typography>
              </Box>

              {currentCluster.autostop && (
                <Box>
                  <Typography level="body-sm" color="neutral">
                    Auto-stop
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <Clock size={14} />
                    <Typography level="body-md">
                      {currentCluster.autostop} min
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>

            {/* Cluster Type Information */}
            {clusterType && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  backgroundColor: 'background.level1',
                  borderRadius: 'sm',
                }}
              >
                <Typography level="title-sm" sx={{ mb: 1 }}>
                  Cluster Type: {clusterType.cluster_type}
                  {clusterType.is_ssh && (
                    <Chip
                      size="sm"
                      color="primary"
                      variant="soft"
                      sx={{ ml: 1 }}
                    >
                      SSH
                    </Chip>
                  )}
                </Typography>

                <Typography level="body-sm" color="neutral" sx={{ mb: 1 }}>
                  Available Operations: {clusterType.available_operations.join(', ')}
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography level="body-xs" color="neutral">
                    <strong>Stop:</strong> {clusterType.recommendations.stop}
                  </Typography>
                  <Typography level="body-xs" color="neutral">
                    <strong>Down:</strong> {clusterType.recommendations.down}
                  </Typography>
                </Box>
              </Box>
            )}
          </Sheet>

          {/* Cluster Jobs */}
          <Sheet
            variant="outlined"
            sx={{ p: 3, borderRadius: 'md', maxWidth: '1000px' }}
          >
            <Typography level="title-lg" sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Zap size={20} />
                Running Jobs ({clusterJobs.length})
              </Box>
            </Typography>

            {clusterJobs.length > 0 ? (
              <Table
                size="md"
                sx={{
                  maxHeight: '400px',
                  overflow: 'auto',
                  '& thead th': {
                    position: 'sticky',
                    top: 0,
                    backgroundColor: 'background.surface',
                  },
                }}
              >
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Job ID</th>
                    <th style={{ width: '200px' }}>Job Name</th>
                    <th style={{ width: '150px' }}>User</th>
                    <th style={{ width: '120px' }}>Status</th>
                    <th style={{ width: '150px' }}>Resources</th>
                    <th style={{ width: '150px' }}>Submitted</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {clusterJobs.map((job) => (
                    <tr key={job.job_id}>
                      <td>
                        <Typography level="body-sm" fontFamily="mono">
                          {job.job_id}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          level="body-sm"
                          sx={{ fontWeight: 'medium' }}
                        >
                          {job.job_name}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{job.username}</Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getJobStatusColor(job.status)}
                          variant="soft"
                        >
                          {job.status}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm">{job.resources}</Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {formatTimestamp(job.submitted_at)}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {job.start_at && job.end_at
                            ? `${Math.round((job.end_at - job.start_at) / 60)}m`
                            : job.start_at
                              ? `${Math.round((Date.now() / 1000 - job.start_at) / 60)}m (running)`
                              : 'Pending'}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Typography
                level="body-md"
                textAlign="center"
                color="neutral"
                sx={{ py: 4 }}
              >
                No jobs are currently running on this cluster.
              </Typography>
            )}
          </Sheet>
        </>
      )}

      {!selectedCluster && clusters.length > 0 && (
        <Typography
          level="body-md"
          textAlign="center"
          color="neutral"
          sx={{ py: 4 }}
        >
          Select a cluster above to view its details and running jobs.
        </Typography>
      )}
    </Sheet>
  );
}