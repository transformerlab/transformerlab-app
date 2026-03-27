import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Select,
  Option,
  FormControl,
  FormLabel,
  List,
  ListItem,
  Chip,
  Grid,
  Table,
  Sheet,
  Button,
  Stack,
  Alert,
} from '@mui/joy';
import { useNavigate } from 'react-router-dom';
import {
  authenticatedFetch,
  getAPIFullPath,
} from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { RotateCcw } from 'lucide-react';
import FixedComputeClusterVisualization from './FixedComputeClusterVisualization';
import LocalMachineSummary from './LocalMachineSummary';

interface Provider {
  id: string;
  name: string;
  type: string;
}

interface Node {
  node_name: string;
  is_fixed: boolean;
  is_active: boolean;
  state: string;
  reason: string;
  resources: {
    cpus_total: number;
    cpus_allocated: number;
    gpus: Record<string, number>;
    gpus_free?: Record<string, number>;
    memory_gb_total: number;
    memory_gb_allocated: number;
  };
}

interface Cluster {
  cluster_id: string;
  cluster_name: string;
  cloud_provider?: string;
  backend_type: string;
  elastic_enabled: boolean;
  max_nodes: number;
  head_node_ip?: string;
  nodes: Node[];
  provider_data?: any;
}

const Resources = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminatingClusters, setTerminatingClusters] = useState<Set<string>>(
    new Set(),
  );
  const [terminateMessage, setTerminateMessage] = useState<string>('');
  const [terminateStatus, setTerminateStatus] = useState<
    'success' | 'error' | null
  >(null);
  const navigate = useNavigate();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      fetchClusters();
    }
  }, [selectedProvider]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch(
        getAPIFullPath('compute_provider', ['list'], {}),
      );
      if (response.ok) {
        const providersData = await response.json();
        setProviders(Array.isArray(providersData) ? providersData : []);
        if (providersData.length > 0 && !selectedProvider) {
          setSelectedProvider(providersData[0].id);
        }
      } else {
        console.error('Failed to fetch providers:', await response.text());
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClusters = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch(
        getAPIFullPath('compute_provider', ['providerClusters'], {
          providerId: selectedProvider,
        }),
      );
      if (response.ok) {
        const clustersData = await response.json();
        console.log('Clusters data:', clustersData); // Added console.log to see the output
        setClusters(Array.isArray(clustersData) ? clustersData : []);
      } else {
        console.error('Failed to fetch clusters:', await response.text());
        setClusters([]);
      }
    } catch (error) {
      console.error('Failed to fetch clusters:', error);
      setClusters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await fetchProviders();
    if (selectedProvider) {
      await fetchClusters();
    }
  };

  const handleTerminateCluster = async (clusterName: string) => {
    if (!selectedProvider) return;

    setTerminatingClusters((prev) => new Set(prev).add(clusterName));
    setTerminateMessage('');
    setTerminateStatus(null);

    try {
      const response = await authenticatedFetch(
        chatAPI.Endpoints.ComputeProvider.StopCluster(
          selectedProvider,
          clusterName,
        ),
        {
          method: 'POST',
        },
      );

      if (response.ok) {
        setTerminateMessage(
          `Successfully initiated termination of cluster "${clusterName}". Refreshing...`,
        );
        setTerminateStatus('success');
        // Refresh clusters after a short delay
        timerRef.current = setTimeout(() => {
          fetchClusters();
        }, 2000);
      } else {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage += `: ${errorData.detail || 'Unknown error'}`;
        } catch (jsonError) {
          const text = await response.text();
          errorMessage += `: ${text || 'Unknown error'}`;
        }
        setTerminateMessage(
          `Failed to terminate cluster "${clusterName}": ${errorMessage}`,
        );
        setTerminateStatus('error');
      }
    } catch (error) {
      console.error('Failed to terminate cluster:', error);
      setTerminateMessage(
        `Failed to terminate cluster "${clusterName}": ${(error as Error).message || 'Network error'}`,
      );
      setTerminateStatus('error');
    } finally {
      setTerminatingClusters((prev) => {
        const newSet = new Set(prev);
        newSet.delete(clusterName);
        return newSet;
      });
    }
  };

  // Organize data into different sections
  const fixedClusters: Cluster[] = [];
  const elasticClusters: Cluster[] = [];
  const activeNodesWithCluster: Array<{ node: Node; cluster: Cluster }> = [];

  // Group elastic clusters by cloud provider
  const cloudGroups: Record<string, Cluster[]> = {};

  clusters.forEach((cluster) => {
    // Check if this is a fixed infrastructure cluster (SSH, SLURM, or non-elastic)
    // Fixed clusters have elastic_enabled: false
    const isFixed = !cluster.elastic_enabled;

    if (isFixed) {
      fixedClusters.push(cluster);
      fixedClusters.backend_type = cluster.backend_type;
    } else {
      elasticClusters.push(cluster);
      elasticClusters.backend_type = cluster.backend_type;

      // Group by cloud provider (use cloud_provider field if available, otherwise cluster_name)
      const cloudName =
        cluster.cloud_provider?.toUpperCase() ||
        cluster.cluster_name.toUpperCase();
      if (!cloudGroups[cloudName]) {
        cloudGroups[cloudName] = [];
      }
      cloudGroups[cloudName].push(cluster);
    }

    cluster.nodes.forEach((node) => {
      if (node.is_active) {
        activeNodesWithCluster.push({ node, cluster });
      }
    });
  });

  const selectedProviderObj = providers.find(
    (provider) => provider.id === selectedProvider,
  );

  if (loading && providers.length === 0 && clusters.length === 0) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="200px"
      >
        <CircularProgress />
      </Box>
    );
  }
  console.log(providers);
  return (
    <Box sx={{ maxHeight: '80vh', overflowY: 'auto', p: 3, pb: 10 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography level="h4">Resources</Typography>
        <Button
          color="neutral"
          variant="plain"
          size="sm"
          startDecorator={
            loading ? (
              <CircularProgress thickness={2} size="sm" color="neutral" />
            ) : (
              <RotateCcw size="20px" />
            )
          }
          onClick={handleRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>
      <FormControl sx={{ mb: 3, maxWidth: 400 }}>
        <FormLabel>Select Compute Provider</FormLabel>
        <Select
          value={selectedProvider}
          onChange={(event, newValue) => setSelectedProvider(newValue || '')}
        >
          {providers.map((provider) => (
            <Option key={provider.id} value={provider.id}>
              {provider.name} ({provider.type})
            </Option>
          ))}
        </Select>
      </FormControl>

      {terminateMessage && terminateStatus && (
        <Alert
          color={terminateStatus === 'success' ? 'success' : 'danger'}
          sx={{ mb: 2 }}
        >
          {terminateMessage}
        </Alert>
      )}

      <Grid container spacing={3}>
        {selectedProviderObj?.type === 'local' && (
          <Grid xs={12}>
            <Card>
              <CardContent>
                <Typography level="title-lg" sx={{ mb: 2 }}>
                  Local Machine
                </Typography>
                <LocalMachineSummary providerId={selectedProviderObj.id} />
              </CardContent>
            </Card>
          </Grid>
        )}
        {/* Fixed Compute Section */}
        <Grid xs={12}>
          <Card>
            <CardContent>
              <Typography level="title-lg" mb={2}>
                Fixed Compute
              </Typography>
              {fixedClusters.length === 0 ? (
                providers.find((p) => p.id === selectedProvider)?.type ===
                'skypilot' ? (
                  <Typography level="body-sm" sx={{ color: 'warning.main' }}>
                    No cluster status received from SkyPilot. Try refreshing...
                  </Typography>
                ) : (
                  <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    No Fixed Compute nodes found.
                  </Typography>
                )
              ) : (
                <Sheet
                  variant="outlined"
                  sx={{
                    borderRadius: 'sm',
                    overflow: 'auto',
                    '& thead th': {
                      backgroundColor: 'background.surface',
                      fontWeight: 'bold',
                      borderBottom: '2px solid',
                      borderBottomColor: 'divider',
                      padding: '12px 16px',
                    },
                    '& tbody td': {
                      padding: '12px 16px',
                      borderBottom: '1px solid',
                      borderBottomColor: 'divider',
                    },
                    '& tbody tr:hover': {
                      backgroundColor: 'background.level1',
                    },
                  }}
                >
                  {/*  */}
                </Sheet>
              )}
              {fixedClusters.length > 0 && (
                <FixedComputeClusterVisualization
                  cluster={fixedClusters[0]}
                  providerId={selectedProvider}
                  onClusterTerminate={handleTerminateCluster}
                  isTerminating={terminatingClusters.has(
                    fixedClusters[0].cluster_name,
                  )}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Elastic Compute Section */}
        <Grid xs={12}>
          <Card>
            <CardContent>
              <Typography level="title-lg" mb={2}>
                Cloud
              </Typography>
              {elasticClusters.length === 0 ? (
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                  No elastic compute clusters found.
                </Typography>
              ) : (
                <Sheet
                  variant="outlined"
                  sx={{
                    borderRadius: 'sm',
                    overflow: 'auto',
                    '& thead th': {
                      backgroundColor: 'background.surface',
                      fontWeight: 'bold',
                      borderBottom: '2px solid',
                      borderBottomColor: 'divider',
                      padding: '12px 16px',
                    },
                    '& tbody td': {
                      padding: '12px 16px',
                      borderBottom: '1px solid',
                      borderBottomColor: 'divider',
                    },
                    '& tbody tr:hover': {
                      backgroundColor: 'background.level1',
                    },
                  }}
                >
                  <Table sx={{ minWidth: 400 }}>
                    <thead>
                      <tr>
                        <th>Cloud</th>
                        <th>Clusters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(cloudGroups).map(
                        ([cloudName, cloudClusters]) => {
                          // Count clusters with active nodes
                          const activeClusters = cloudClusters.filter(
                            (c) =>
                              c.nodes.length > 0 &&
                              c.nodes.some((n) => n.is_active),
                          );
                          const totalClusters = activeClusters.length;

                          return (
                            <tr key={cloudName}>
                              <td>
                                <Typography level="body-md" fontWeight="bold">
                                  {cloudName}
                                </Typography>
                              </td>
                              <td>
                                {totalClusters > 0 ? (
                                  <Typography level="body-md">
                                    {totalClusters}{' '}
                                    {totalClusters === 1
                                      ? 'cluster'
                                      : 'clusters'}
                                  </Typography>
                                ) : (
                                  <Typography
                                    level="body-sm"
                                    sx={{
                                      color: 'text.secondary',
                                      fontStyle: 'italic',
                                    }}
                                  >
                                    No active clusters
                                  </Typography>
                                )}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </Table>
                </Sheet>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Active Nodes Section */}
        <Grid xs={12}>
          <Card>
            <CardContent>
              <Typography level="title-lg" mb={2}>
                Active Nodes
              </Typography>
              {activeNodesWithCluster.length === 0 ? (
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                  No active nodes found.
                </Typography>
              ) : (
                <Sheet
                  variant="outlined"
                  sx={{
                    borderRadius: 'sm',
                    overflow: 'auto',
                    '& thead th': {
                      backgroundColor: 'background.surface',
                      fontWeight: 'bold',
                      borderBottom: '2px solid',
                      borderBottomColor: 'divider',
                      padding: '12px 16px',
                    },
                    '& tbody td': {
                      padding: '12px 16px',
                      borderBottom: '1px solid',
                      borderBottomColor: 'divider',
                    },
                    '& tbody tr:hover': {
                      backgroundColor: 'background.level1',
                    },
                  }}
                >
                  <Table sx={{ minWidth: 800 }}>
                    <thead>
                      <tr>
                        <th>Node Name</th>
                        <th>Cloud/SSH</th>
                        <th>Cluster</th>
                        <th>State</th>
                        <th>CPUs</th>
                        <th>Memory (GB)</th>
                        <th>GPUs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeNodesWithCluster.map(({ node, cluster }) => {
                        // Determine if this is a fixed infrastructure (SSH, SLURM, etc.) or cloud
                        const isFixed = !cluster.elastic_enabled;

                        // Get backend type for display
                        const backendType =
                          cluster.backend_type ||
                          cluster.cloud_provider?.toUpperCase() ||
                          'UNKNOWN';

                        const cloudType = isFixed
                          ? backendType
                          : cluster.cloud_provider?.toUpperCase() ||
                            cluster?.cluster_name.toUpperCase();

                        return (
                          <tr key={`${cluster.cluster_id}-${node.node_name}`}>
                            <td>
                              <Typography level="body-md" fontWeight="bold">
                                {node.node_name}
                              </Typography>
                            </td>
                            <td>
                              <Chip
                                color={isFixed ? 'warning' : 'primary'}
                                size="sm"
                                variant="soft"
                              >
                                {cloudType}
                              </Chip>
                            </td>
                            <td>
                              <Typography level="body-md">
                                {cluster.cluster_name}
                              </Typography>
                            </td>
                            <td>
                              <Chip color="success" size="sm">
                                {node.state}
                              </Chip>
                            </td>
                            <td>
                              <Typography level="body-md">
                                {node.resources.cpus_allocated}/
                                {node.resources.cpus_total}
                              </Typography>
                            </td>
                            <td>
                              <Typography level="body-md">
                                {node.resources.memory_gb_allocated}/
                                {node.resources.memory_gb_total}
                              </Typography>
                            </td>
                            <td>
                              {Object.keys(node.resources.gpus).length > 0 ? (
                                <Box>
                                  {Object.entries(node.resources.gpus).map(
                                    ([type, count]) => (
                                      <Chip
                                        key={type}
                                        size="sm"
                                        variant="soft"
                                        sx={{ mr: 0.5 }}
                                      >
                                        {type}: {count}
                                      </Chip>
                                    ),
                                  )}
                                </Box>
                              ) : (
                                <Typography
                                  level="body-sm"
                                  sx={{ color: 'text.secondary' }}
                                >
                                  -
                                </Typography>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </Sheet>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Resources;
