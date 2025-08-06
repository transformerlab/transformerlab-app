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
} from '@mui/joy';
import { RotateCcwIcon } from 'lucide-react';
import { useNotification } from '../../Shared/NotificationSystem';

interface SSHCluster {
  name: string;
  hosts_count: number;
  has_defaults: boolean;
}

interface SSHNode {
  ip: string;
  user: string;
  identity_file?: string;
  password?: string;
}

interface ClusterResponse {
  cluster_name: string;
  nodes: SSHNode[];
}

interface NodePoolsProps {
  latticeApiUrl?: string;
  latticeApiKey?: string;
}

export default function NodePools({
  latticeApiUrl,
  latticeApiKey,
}: NodePoolsProps) {
  const { addNotification } = useNotification();
  const [selectedNodePool, setSelectedNodePool] = React.useState<string>('');
  const [nodePoolsLoading, setNodePoolsLoading] =
    React.useState<boolean>(false);
  const [nodePools, setNodePools] = React.useState<SSHCluster[]>([]);
  const [nodePoolDetails, setNodePoolDetails] =
    React.useState<ClusterResponse | null>(null);

  // Fetch node pools function
  const fetchNodePools = React.useCallback(async () => {
    if (!latticeApiUrl || !latticeApiKey) return;

    setNodePoolsLoading(true);
    try {
      const response = await fetch(
        `${latticeApiUrl}/api/v1/skypilot/ssh-clusters`,
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
        setNodePools([]);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch node pools (${response.status})`);
      }

      const data = await response.json();
      setNodePools(data.ssh_clusters || []);
    } catch (error) {
      addNotification({
        type: 'danger',
        message: 'Failed to fetch node pools. Please check your configuration.',
      });
      setNodePools([]);
    } finally {
      setNodePoolsLoading(false);
    }
  }, [latticeApiUrl, latticeApiKey, addNotification]);

  // Fetch node pool details function
  const fetchNodePoolDetails = React.useCallback(
    async (clusterName: string) => {
      if (!latticeApiUrl || !latticeApiKey || !clusterName) return;

      try {
        const response = await fetch(
          `${latticeApiUrl}/api/v1/clusters/${clusterName}`,
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
          setNodePoolDetails(null);
          return;
        }

        if (!response.ok) {
          throw new Error(
            `Failed to fetch details for cluster ${clusterName} (${response.status})`,
          );
        }

        const data = await response.json();
        setNodePoolDetails(data);
      } catch (error) {
        addNotification({
          type: 'warning',
          message: `Failed to fetch details for cluster ${clusterName}`,
        });
        setNodePoolDetails(null);
      }
    },
    [latticeApiUrl, latticeApiKey, addNotification],
  );

  // Fetch node pools when credentials are available
  React.useEffect(() => {
    if (latticeApiUrl && latticeApiKey) {
      fetchNodePools();
    }
  }, [latticeApiUrl, latticeApiKey, fetchNodePools]);

  // Fetch details when a node pool is selected
  React.useEffect(() => {
    if (selectedNodePool) {
      fetchNodePoolDetails(selectedNodePool);
    } else {
      setNodePoolDetails(null);
    }
  }, [selectedNodePool, fetchNodePoolDetails]);

  if (!latticeApiUrl || !latticeApiKey) {
    return (
      <Sheet sx={{ p: 2 }}>
        <Typography level="body-lg" textAlign="center" color="neutral">
          Please configure Lattice API credentials in Settings to view Node
          Pools.
        </Typography>
      </Sheet>
    );
  }

  return (
    <Sheet sx={{ p: 2 }}>
      <Typography level="h2" marginBottom={2}>
        Cloud Node Pools
      </Typography>
      <Typography level="body-md" marginBottom={3} color="neutral">
        Manage and view your cloud-based compute node pools for distributed
        workloads.
      </Typography>

      <FormControl sx={{ maxWidth: '500px', mb: 2 }}>
        <FormLabel>Select Node Pool</FormLabel>
        {nodePoolsLoading ? (
          <CircularProgress size="sm" />
        ) : (
          <Select
            placeholder="Choose a node pool..."
            value={selectedNodePool}
            onChange={(_, value) => setSelectedNodePool(value || '')}
          >
            {nodePools.map((pool) => (
              <Option key={pool.name} value={pool.name}>
                {pool.name} ({pool.hosts_count} hosts)
                {pool.has_defaults && ' ✓'}
              </Option>
            ))}
          </Select>
        )}
        <FormHelperText>
          {nodePools.length === 0 && !nodePoolsLoading
            ? 'No node pools found. Check your API configuration.'
            : 'Select a node pool to view details'}
        </FormHelperText>
      </FormControl>

      <Button
        variant="soft"
        onClick={fetchNodePools}
        loading={nodePoolsLoading}
        sx={{ mb: 3, maxWidth: '150px' }}
        startDecorator={<RotateCcwIcon size={16} />}
      >
        Refresh
      </Button>

      {/* Node Pool Details */}
      {nodePoolDetails && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Sheet
            variant="outlined"
            sx={{ p: 3, borderRadius: 'md', maxWidth: '800px' }}
          >
            <Typography level="title-lg" sx={{ mb: 1 }}>
              Cluster: {nodePoolDetails.cluster_name}
            </Typography>
            <Typography level="body-sm" sx={{ mb: 3 }} color="neutral">
              Total Nodes: {nodePoolDetails.nodes?.length || 0}
            </Typography>

            {nodePoolDetails.nodes && nodePoolDetails.nodes.length > 0 && (
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
                    <th style={{ width: '200px' }}>IP Address</th>
                    <th style={{ width: '120px' }}>User</th>
                    <th style={{ width: '150px' }}>Authentication</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nodePoolDetails.nodes.map((node) => (
                    <tr key={node.ip}>
                      <td>
                        <Typography level="body-sm" fontFamily="mono">
                          {node.ip}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{node.user}</Typography>
                      </td>
                      <td>
                        <Typography
                          level="body-sm"
                          color={node.identity_file ? 'success' : 'warning'}
                        >
                          {node.identity_file ? 'SSH Key' : 'Password'}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm" color="neutral">
                          Available
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            {(!nodePoolDetails.nodes || nodePoolDetails.nodes.length === 0) && (
              <Typography
                level="body-md"
                textAlign="center"
                color="neutral"
                sx={{ py: 4 }}
              >
                No nodes found in this cluster.
              </Typography>
            )}
          </Sheet>
        </>
      )}

      {!nodePoolDetails && selectedNodePool && (
        <Typography
          level="body-md"
          textAlign="center"
          color="neutral"
          sx={{ py: 4 }}
        >
          Loading cluster details...
        </Typography>
      )}
    </Sheet>
  );
}
