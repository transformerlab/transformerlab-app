import React, { useState, useEffect } from 'react';
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
} from '@mui/joy';
import {
  authenticatedFetch,
  getAPIFullPath,
} from 'renderer/lib/transformerlab-api-sdk';
import { RotateCcw } from 'lucide-react';
import FixedComputeClusterVisualization from './FixedComputeClusterVisualization';

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

  useEffect(() => {
    fetchProviders();
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      fetchClusters();
    }
  }, [selectedProvider]);

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

  if (loading) {
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
        <FormLabel>Select Provider</FormLabel>
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

      <Grid container spacing={3}>
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
                  {/* <Table sx={{ minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th>
                          {fixedClusters?.backend_type === 'SLURM'
                            ? 'Partition'
                            : 'Node Pool'}
                        </th>
                        <th>Clusters</th>
                        <th>Jobs</th>
                        <th>Nodes</th>
                        <th>GPU Types</th>
                        <th>#GPUs</th>
                        <th>GPU Availability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixedClusters.map((cluster) => {
                        // Calculate totals from nodes
                        const totalGPUs = cluster.nodes
                          .filter((node) => node.is_fixed === true)
                          .reduce((sum, node) => {
                            const nodeGPUCount = Object.values(
                              node.resources.gpus,
                            ).reduce((a, b) => a + b, 0);
                            return sum + nodeGPUCount;
                          }, 0);

                        // Get free GPUs from the pool capacity node
                        const freeGPUs = cluster.nodes
                          .filter((node) => node.is_fixed === true)
                          .reduce((sum, node) => {
                            const nodeFreeGPUCount = node.resources.gpus_free
                              ? Object.values(node.resources.gpus_free).reduce(
                                  (a, b) => a + b,
                                  0,
                                )
                              : 0;
                            return sum + nodeFreeGPUCount;
                          }, 0);

                        const gpuTypes = new Set<string>();
                        cluster.nodes.forEach((node) => {
                          Object.keys(node.resources.gpus).forEach((gpuType) =>
                            gpuTypes.add(gpuType),
                          );
                        });

                        // Count active nodes (running clusters/jobs)
                        const activeNodes = cluster.nodes.filter(
                          (node) => node.is_active,
                        ).length;

                        return (
                          <tr key={cluster.cluster_id}>
                            <td>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                }}
                              >
                                <Typography
                                  level="body-md"
                                  fontWeight="bold"
                                  sx={{
                                    color: 'primary.main',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {cluster.cluster_name}
                                </Typography>
                              </Box>
                            </td>
                            <td>
                              <Typography level="body-md">
                                {activeNodes > 0 ? activeNodes : '0'}
                              </Typography>
                            </td>
                            <td>
                              <Typography
                                level="body-md"
                                sx={{
                                  color:
                                    activeNodes > 0
                                      ? 'inherit'
                                      : 'text.secondary',
                                }}
                              >
                                {activeNodes > 0 ? activeNodes : '0'}
                              </Typography>
                            </td>
                            <td>
                              <Typography level="body-md">
                                {cluster.nodes.length > 0
                                  ? cluster.nodes.length
                                  : '1'}
                              </Typography>
                            </td>
                            <td>
                              {gpuTypes.size > 0 ? (
                                <Typography level="body-md">
                                  {Array.from(gpuTypes).join(', ')}
                                </Typography>
                              ) : (
                                <Typography
                                  level="body-md"
                                  sx={{ color: 'text.secondary' }}
                                >
                                  -
                                </Typography>
                              )}
                            </td>
                            <td>
                              <Typography level="body-md">
                                {totalGPUs > 0 ? totalGPUs : '0'}
                              </Typography>
                            </td>
                            <td>
                              {totalGPUs > 0 ? (
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                  }}
                                >
                                  <Chip
                                    color={
                                      freeGPUs === totalGPUs
                                        ? 'success'
                                        : freeGPUs > 0
                                          ? 'warning'
                                          : 'danger'
                                    }
                                    size="sm"
                                    variant="soft"
                                  >
                                    {freeGPUs} of {totalGPUs} free
                                  </Chip>
                                </Box>
                              ) : (
                                <Typography
                                  level="body-md"
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
                  </Table> */}
                </Sheet>
              )}
              {fixedClusters.length > 0 && (
                <FixedComputeClusterVisualization cluster={fixedClusters[0]} />
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
