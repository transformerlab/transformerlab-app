import React from 'react';
import { Box, Chip, Grid, LinearProgress, Stack, Typography } from '@mui/joy';
import { getAPIFullPath, fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import {
  FaComputer,
  FaApple,
  FaWindows,
  FaLinux,
  FaPython,
  SiNvidia,
  BsGpuCard,
} from 'renderer/components/Icons';
import { formatBytes } from 'renderer/lib/utils';

function StatRow({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
        {title}
      </Typography>
      <Typography level="body-sm">{value}</Typography>
    </Stack>
  );
}

type LocalProviderConfig = {
  os?: string;
  name?: string;
  platform?: string;
  python_version?: string;
  cpu_percent?: number;
  cpu_count?: number;
  device?: string;
  device_type?: string;
  cuda_version?: string;
  memory?: { total: number; available: number; percent?: number };
  disk?: { total: number; used: number; free: number; percent?: number };
  gpu?: Array<{ name?: string; total_memory?: number; free_memory?: number }>;
  mac_metrics?: unknown;
};

type ProviderCluster = {
  backend_type?: string;
  provider_data?: LocalProviderConfig;
};

export default function LocalMachineSummary({
  providerId,
}: {
  providerId: string;
}) {
  const clustersKey = providerId
    ? getAPIFullPath('compute_provider', ['providerClusters'], { providerId })
    : null;

  const {
    data,
    isError: swrIsError,
    isLoading,
  } = useSWR(clustersKey, fetcher, { refreshInterval: 2000 });

  const clusters: ProviderCluster[] = Array.isArray(data) ? data : [];
  const localCluster =
    clusters.find((c) => String(c.backend_type).toLowerCase() === 'local') ??
    clusters[0] ??
    null;
  const server = localCluster?.provider_data ?? null;
  const isError = !!swrIsError;

  if (isLoading) {
    return (
      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
        Loading local machine information...
      </Typography>
    );
  }

  if (isError) {
    return (
      <Typography level="body-sm" sx={{ color: 'danger.plainColor' }}>
        Unable to load local machine information.
      </Typography>
    );
  }

  if (!server) {
    return (
      <Typography level="body-sm" sx={{ color: 'danger.plainColor' }}>
        Your local provider was not setup correctly. Please re-add your local
        provider
      </Typography>
    );
  }

  const gpuCount = server.gpu?.length ?? 0;

  return (
    <Grid container spacing={2}>
      <Grid xs={12} md={4}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <FaComputer />
          <Typography level="title-md">Machine</Typography>
        </Stack>
        <Typography level="body-sm" sx={{ mb: 1, color: 'text.tertiary' }}>
          {server.os} - {server.name}
        </Typography>
        <StatRow title="CPU usage" value={`${server.cpu_percent ?? 0}%`} />
        <StatRow title="Cores" value={server.cpu_count ?? 'n/a'} />
      </Grid>

      <Grid xs={12} md={4}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <BsGpuCard />
          <Typography level="title-md">Acceleration</Typography>
        </Stack>
        <StatRow
          title="GPU"
          value={
            gpuCount > 0 ? (
              <Box
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              >
                {server.gpu?.[0]?.name?.includes('NVIDIA') && (
                  <SiNvidia color="#76B900" />
                )}
                <span>
                  {gpuCount} device{gpuCount === 1 ? '' : 's'}
                </span>
              </Box>
            ) : (
              'None'
            )
          }
        />
        <StatRow
          title={server?.device_type !== 'amd' ? 'CUDA' : 'ROCm'}
          value={server.device === 'cuda' ? 'Available' : 'Unavailable'}
        />
        <StatRow
          title="Python MPS"
          value={server.device === 'mps' ? 'Enabled' : 'Disabled'}
        />
      </Grid>

      <Grid xs={12} md={4}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <FaPython />
          <Typography level="title-md">Environment</Typography>
        </Stack>
        <StatRow title="Python" value={server.python_version ?? 'n/a'} />
        <StatRow
          title="Memory"
          value={
            server.memory
              ? `${formatBytes(server.memory.available)} free / ${formatBytes(
                  server.memory.total,
                )}`
              : 'n/a'
          }
        />
        {server.disk && (
          <Box sx={{ mt: 0.5 }}>
            <Typography level="body-xs" sx={{ mb: 0.25 }}>
              Disk usage
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <LinearProgress
                determinate
                value={server.disk.percent}
                sx={{ flex: 1, height: 6, borderRadius: 999 }}
              />
              <Typography level="body-xs">{server.disk.percent}%</Typography>
            </Stack>
          </Box>
        )}
        <Box sx={{ mt: 1 }}>
          <Typography level="body-xs" sx={{ mb: 0.5 }}>
            Operating system
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {server.platform?.toLowerCase().includes('microsoft') && (
              <FaWindows />
            )}
            {server.platform?.toLowerCase().includes('mac') && <FaApple />}
            {server.platform?.toLowerCase().includes('linux') && <FaLinux />}
            <Chip size="sm" variant="soft">
              {server.platform}
            </Chip>
          </Stack>
        </Box>
      </Grid>
    </Grid>
  );
}
