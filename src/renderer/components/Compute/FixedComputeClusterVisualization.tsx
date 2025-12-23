import React from 'react';
import Box from '@mui/joy/Box';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import Card from '@mui/joy/Card';
import Divider from '@mui/joy/Divider';
import Chip from '@mui/joy/Chip';
import LinearProgress from '@mui/joy/LinearProgress';
import Tooltip from '@mui/joy/Tooltip';
import Stack from '@mui/joy/Stack';
import { InfoIcon } from 'lucide-react';

interface NodeResources {
  cpus_total?: number;
  cpus_allocated?: number;
  // Support both explicit GPU records and potential future formats
  gpus?: Record<string, number>;
  gpus_free?: Record<string, number>;
  memory_gb_total?: number;
  memory_gb_allocated?: number;
}

interface ClusterNode {
  node_name: string;
  is_fixed?: boolean;
  is_active?: boolean;
  state: string; // "alive", "AVAILABLE", "STOPPED", etc.
  reason?: string;
  resources: NodeResources;
}

interface ClusterData {
  cluster_id: string;
  cluster_name: string;
  backend_type: string;
  max_nodes: number;
  head_node_ip?: string | null;
  nodes: ClusterNode[];
}

// --- 2. Helper: Normalize Data Logic ---

const getStatusColor = (state: string, isActive: boolean) => {
  const s = state.toUpperCase();
  // Map various backend states to Joy UI colors
  if (s === 'ALIVE' || s === 'AVAILABLE' || isActive) return 'success';
  if (s === 'BUSY' || s === 'ALLOCATED') return 'primary';
  if (s === 'STOPPED' || s === 'OFFLINE') return 'neutral';
  return 'danger'; // Error states
};

const calculateGpuStats = (resources: NodeResources) => {
  const gpus = resources.gpus || {};
  const gpusFree = resources.gpus_free || {};

  const total = Object.values(gpus).reduce((a, b) => a + b, 0);
  const free = Object.values(gpusFree).reduce((a, b) => a + b, 0);
  const used = total - free;

  // Get GPU Model Name (e.g., "RTX3090") for label
  const modelName = Object.keys(gpus)[0] || 'GPU';

  return { total, used, modelName };
};

// --- 3. Visual Components ---

const ResourceGrid = ({
  total,
  used,
  type,
  label,
}: {
  total: number;
  used: number;
  type: 'cpu' | 'gpu';
  label: string;
}) => {
  // Gracefully hide if resource is not reported (0)
  if (!total || total <= 0) return null;

  const squares = Array.from({ length: total }, (_, i) => {
    const isUsed = i < used;
    // Purple for GPU, Blue for CPU
    const activeColor = type === 'gpu' ? '#9333ea' : 'primary.500';
    const inactiveColor = 'neutral.200';

    return (
      <Tooltip
        key={i}
        title={`${label} #${i + 1}: ${isUsed ? 'Allocated' : 'Available'}`}
        variant="soft"
      >
        <Box
          sx={{
            width: type === 'gpu' ? 14 : 8,
            height: type === 'gpu' ? 14 : 8,
            bgcolor: isUsed ? activeColor : inactiveColor,
            borderRadius: type === 'gpu' ? 'xs' : '1px',
            transition: 'background-color 0.2s',
          }}
        />
      </Tooltip>
    );
  });

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" mb={0.5}>
        <Typography
          level="body-xs"
          fontWeight="lg"
          textTransform="uppercase"
          sx={{ color: 'text.tertiary' }}
        >
          {label}
        </Typography>
        <Typography level="body-xs" fontWeight="lg">
          {used} / {total}
        </Typography>
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{squares}</Box>
    </Box>
  );
};

const MemoryStats = ({
  used = 0,
  total = 0,
}: {
  used?: number;
  total?: number;
}) => {
  // Hide if memory is 0 (SkyPilot case)
  if (!total || total <= 0) return null;

  const percentage = Math.min((used / total) * 100, 100);

  let color: 'success' | 'warning' | 'danger' | 'primary' = 'success';
  if (percentage > 90) color = 'danger';
  else if (percentage > 70) color = 'warning';
  else color = 'primary';

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" mb={0.5}>
        <Typography
          level="body-xs"
          fontWeight="lg"
          textTransform="uppercase"
          sx={{ color: 'text.tertiary' }}
        >
          Memory
        </Typography>
        <Typography level="body-xs">
          {used.toFixed(1)} / {total.toFixed(1)} GB
        </Typography>
      </Stack>
      <LinearProgress
        determinate
        value={percentage}
        color={color}
        size="sm"
        sx={{ bgcolor: 'background.level2', borderRadius: 'sm' }}
      />
    </Box>
  );
};

const NodeCard = ({ node }: { node: ClusterNode }) => {
  // Determine if active based on 'state' string OR 'is_active' bool
  const isActiveBool = node.is_active === true;
  const statusColor = getStatusColor(node.state, isActiveBool);

  // Resource Calculations
  const {
    total: gpuTotal,
    used: gpuUsed,
    modelName: gpuModel,
  } = calculateGpuStats(node.resources);
  const cpuTotal = node.resources.cpus_total || 0;
  const cpuUsed = node.resources.cpus_allocated || 0;

  return (
    <Card
      variant="outlined"
      sx={{
        minWidth: 280,
        boxShadow: 'sm',
        backgroundColor: 'background.surface',
        borderColor: 'neutral.outlinedBorder',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          borderColor: 'primary.300',
          boxShadow: 'md',
        },
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        mb={1}
      >
        <Box>
          <Typography level="title-md" fontWeight="bold" sx={{ mb: 0.5 }}>
            {node.node_name}
          </Typography>
          <Chip
            variant="soft"
            color={statusColor}
            size="sm"
            startDecorator={
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: 'currentColor',
                }}
              />
            }
          >
            {node.state}
          </Chip>
        </Box>
        {node.is_fixed && (
          <Chip
            size="sm"
            variant="plain"
            color="neutral"
            sx={{ fontSize: 'xs', textTransform: 'uppercase' }}
          >
            Fixed
          </Chip>
        )}
      </Stack>

      <Divider sx={{ my: 1.5, opacity: 0.5 }} />

      {/* Resources Body */}
      <Box sx={{ flexGrow: 1 }}>
        {/* If NO resources are reported at all, show a placeholder */}
        {gpuTotal === 0 && cpuTotal === 0 && !node.resources.memory_gb_total ? (
          <Typography
            level="body-xs"
            sx={{
              fontStyle: 'italic',
              color: 'text.tertiary',
              textAlign: 'center',
              py: 2,
            }}
          >
            No resource metrics available
          </Typography>
        ) : (
          <>
            <ResourceGrid
              total={gpuTotal}
              used={gpuUsed}
              type="gpu"
              label={`${gpuModel}s`}
            />
            <ResourceGrid
              total={cpuTotal}
              used={cpuUsed}
              type="cpu"
              label="CPUs"
            />
            <MemoryStats
              used={node.resources.memory_gb_allocated}
              total={node.resources.memory_gb_total}
            />
          </>
        )}
      </Box>

      {/* Footer / Reason (Only if present) */}
      {node.reason && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ mt: 2, p: 1, borderRadius: 'sm' }}
        >
          <Stack direction="row" gap={1} alignItems="start">
            <InfoIcon
              style={{ fontSize: 16, color: 'text.secondary', marginTop: 0.2 }}
            />
            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
              {node.reason}
            </Typography>
          </Stack>
        </Sheet>
      )}
    </Card>
  );
};

// --- 4. Main Export ---

export default function UnifiedComputeCluster({
  cluster,
}: {
  cluster: ClusterData;
}) {
  return (
    <Sheet
      sx={{
        p: { xs: 2, md: 4 },
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      {/* Cluster Header */}
      <Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          gap={2}
          mb={1}
        >
          <Typography level="h2">{cluster.cluster_name}</Typography>
          <Chip
            variant="outlined"
            color="primary"
            size="sm"
            sx={{ fontFamily: 'monospace' }}
          >
            {cluster.cluster_id}
          </Chip>
        </Stack>

        <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
          <Chip variant="soft" color="primary" size="sm">
            {cluster.backend_type}
          </Chip>
          {cluster.head_node_ip && (
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Head IP: {cluster.head_node_ip}
            </Typography>
          )}
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Nodes: {cluster.nodes.length} / {cluster.max_nodes}
          </Typography>
        </Stack>
      </Box>

      <Divider />

      {/* Grid Layout */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 3,
        }}
      >
        {cluster.nodes.map((node, index) => (
          <NodeCard key={index} node={node} />
        ))}
      </Box>
    </Sheet>
  );
}
