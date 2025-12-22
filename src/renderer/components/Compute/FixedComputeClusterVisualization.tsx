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
import { useTheme } from '@mui/joy/styles';

// --- Types ---
interface ClusterNode {
  node_name: string;
  is_fixed: boolean;
  is_active: boolean;
  state: string;
  reason: string;
  resources: {
    cpus_total: number;
    cpus_allocated: number;
    gpus: Record<string, number>;
    gpus_free: Record<string, number>;
    memory_gb_total: number;
    memory_gb_allocated: number;
  };
}

interface ClusterProps {
  cluster: {
    cluster_id: string;
    cluster_name: string;
    backend_type: string;
    max_nodes: number;
    head_node_ip: string;
    nodes: ClusterNode[];
  };
}

// --- Sub-components ---

// 1. Tiny Square Grid Visualization
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
  if (total === 0) return null;

  const squares = Array.from({ length: total }, (_, i) => {
    const isUsed = i < used;
    // GPU = Purple (custom), CPU = Primary (Blue)
    const activeColor = type === 'gpu' ? '#9333ea' : 'primary.500';
    const inactiveColor = 'neutral.200';

    return (
      <Tooltip
        key={i}
        title={`${label} #${i + 1}: ${isUsed ? 'Allocated' : 'Free'}`}
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

// 2. Memory Progress Bar
const MemoryStats = ({ used, total }: { used: number; total: number }) => {
  const percentage = Math.min((used / total) * 100, 100);

  // Joy UI color palettes logic
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
        sx={{ bgcolor: 'background.level2' }}
      />
    </Box>
  );
};

// 3. Single Node Card
const NodeCard = ({ node }: { node: ClusterNode }) => {
  const isActive = node.state === 'alive' || node.is_active;
  const statusColor = isActive ? 'success' : 'neutral';

  // Calculate GPU logic
  const totalGpus = Object.values(node.resources.gpus).reduce(
    (a, b) => a + b,
    0,
  );
  const freeGpus = Object.values(node.resources.gpus_free).reduce(
    (a, b) => a + b,
    0,
  );
  const allocatedGpus = totalGpus - freeGpus;

  return (
    <Card
      variant="outlined"
      sx={{
        width: 300,
        boxShadow: 'sm',
        borderColor: isActive
          ? 'neutral.outlinedBorder'
          : 'neutral.outlinedBorder',
        backgroundColor: isActive ? 'background.surface' : 'background.level1',
        opacity: isActive ? 1 : 0.8,
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
        alignItems="center"
        mb={1}
      >
        <Box>
          <Typography level="title-md" fontWeight="bold">
            {node.node_name}
          </Typography>
          <Stack direction="row" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: `${statusColor}.500`,
              }}
            />
            <Typography level="body-xs" color={statusColor}>
              {node.state}
            </Typography>
          </Stack>
        </Box>
        {node.is_fixed && (
          <Chip size="sm" variant="soft" color="neutral">
            Fixed
          </Chip>
        )}
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* Resources */}
      <Box sx={{ flexGrow: 1 }}>
        <ResourceGrid
          total={totalGpus}
          used={allocatedGpus}
          type="gpu"
          label="GPUs"
        />
        <ResourceGrid
          total={node.resources.cpus_total}
          used={node.resources.cpus_allocated}
          type="cpu"
          label="CPUs"
        />
        <MemoryStats
          used={node.resources.memory_gb_allocated}
          total={node.resources.memory_gb_total}
        />
      </Box>

      {/* Footer Reason */}
      {node.reason && (
        <Sheet
          variant="soft"
          color="warning"
          sx={{ mt: 2, p: 1, borderRadius: 'sm', fontSize: 'xs' }}
        >
          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
            Note: {node.reason}
          </Typography>
        </Sheet>
      )}
    </Card>
  );
};

// --- Main Component ---

export default function FixedComputeClusterVisualization({
  cluster,
}: ClusterProps) {
  return (
    <Sheet
      sx={{
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      {/* Header Section */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Stack direction="row" alignItems="center" gap={2}>
          <Typography level="h2">{cluster?.cluster_name}</Typography>
          <Chip variant="outlined" color="primary" size="sm">
            {cluster?.cluster_id}
          </Chip>
        </Stack>

        <Stack direction="row" gap={2} alignItems="center">
          <Chip variant="soft" color="primary" size="sm">
            Type: {cluster?.backend_type}
          </Chip>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Head IP: {cluster?.head_node_ip}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Nodes: {cluster?.nodes.length} / {cluster?.max_nodes}
          </Typography>
        </Stack>
      </Box>

      <Divider />

      {/* Node Grid */}
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
