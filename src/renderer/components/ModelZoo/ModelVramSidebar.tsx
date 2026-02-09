import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Drawer,
  Divider,
  LinearProgress,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy';
import { MemoryStickIcon, XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useServerStats } from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';

export type ModelGalleryEntry = {
  uniqueID: string;
  name: string;
  huggingface_repo?: string;
  gated?: boolean;
  id?: string;
  new?: boolean;
  license?: string;
  architecture?: string;
  size_of_model_in_mb?: number;
  downloaded?: boolean;
  tags?: string[];
};

type VramEstimateData = {
  model_id: string;
  dtype: string;
  batch: number;
  seq_len: number;
  no_kv: boolean;
  total_gb?: number | null;
  weights_gb?: number | null;
  kv_cache_gb?: number | null;
  activations_gb?: number | null;
  raw?: unknown;
};

type VramEstimateResponse = {
  status: 'success' | 'error' | 'unauthorized';
  data?: VramEstimateData;
  message?: string;
};

const DEFAULT_SETTINGS = {
  dtype: 'float16',
  batch: 1,
  seqLen: 4096,
  noKv: false,
};

function formatGigabytes(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(2)} GB`;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={1}>
      <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography level="body-sm" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function ModelVramSidebar({
  model,
  open,
  onClose,
}: {
  model: ModelGalleryEntry | null;
  open?: boolean;
  onClose?: () => void;
}) {
  const modelId = model?.huggingface_repo || model?.uniqueID || model?.id || '';
  const hasModelId = Boolean(modelId);
  const { server } = useServerStats();

  const vramUrl = useMemo(() => {
    if (!modelId) return null;
    return chatAPI.Endpoints.Models.VramEstimate(
      modelId,
      DEFAULT_SETTINGS.dtype,
      DEFAULT_SETTINGS.batch,
      DEFAULT_SETTINGS.seqLen,
      DEFAULT_SETTINGS.noKv,
    );
  }, [modelId]);

  const { data: vramResponse, isLoading: vramLoading, isError: vramError } =
    useSWR(vramUrl);

  const vramData = (vramResponse as VramEstimateResponse | undefined)?.data;
  const rawBreakdown =
    (vramData?.raw as { memory_breakdown_gb?: Record<string, number> } | null)
      ?.memory_breakdown_gb ?? null;
  const weightsGb =
    typeof vramData?.weights_gb === 'number'
      ? vramData.weights_gb
      : rawBreakdown?.weights;
  const kvCacheGb =
    typeof vramData?.kv_cache_gb === 'number'
      ? vramData.kv_cache_gb
      : rawBreakdown?.kv_cache;
  const activationsGb =
    typeof vramData?.activations_gb === 'number'
      ? vramData.activations_gb
      : rawBreakdown?.activations;
  const totalGb =
    typeof vramData?.total_gb === 'number'
      ? vramData.total_gb
      : rawBreakdown?.total;
  const vramStatus = (vramResponse as VramEstimateResponse | undefined)?.status;
  const vramMessage = (vramResponse as VramEstimateResponse | undefined)
    ?.message;
  const isUnauthorized = vramStatus === 'unauthorized';

  const hasServerStats = Boolean(server);
  const maxTotalBytes =
    server?.gpu?.reduce(
      (max: number, gpu: { total_memory?: number }) =>
        Math.max(max, Number(gpu?.total_memory) || 0),
      0,
    ) ?? 0;
  const maxFreeBytes =
    server?.gpu?.reduce(
      (max: number, gpu: { free_memory?: number }) =>
        Math.max(max, Number(gpu?.free_memory) || 0),
      0,
    ) ?? 0;
  const unifiedMemoryGb = server?.mac_metrics?.soc?.memory_gb;

  const systemTotalGb =
    typeof unifiedMemoryGb === 'number' && unifiedMemoryGb > 0
      ? unifiedMemoryGb
      : maxTotalBytes > 0
        ? maxTotalBytes / 1024 ** 3
        : null;
  const systemFreeGb = maxFreeBytes > 0 ? maxFreeBytes / 1024 ** 3 : null;
  const estimateGb =
    typeof totalGb === 'number'
      ? totalGb
      : typeof weightsGb === 'number' ||
          typeof kvCacheGb === 'number' ||
          typeof activationsGb === 'number'
        ? (weightsGb || 0) + (kvCacheGb || 0) + (activationsGb || 0)
        : null;
  const capacityGb =
    typeof systemFreeGb === 'number' ? systemFreeGb : systemTotalGb;
  const canRun =
    typeof estimateGb === 'number' && typeof capacityGb === 'number'
      ? estimateGb <= capacityGb
      : null;

  const sidebarContent = (
    <Sheet
      variant="outlined"
      sx={{
        borderRadius: 'md',
        p: 2,
        width: { xs: '100%', sm: 360 },
        maxWidth: { xs: '100%', sm: 420 },
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <MemoryStickIcon size={18} />
          <Typography level="title-md" sx={{ flex: 1 }}>
            VRAM Estimate
          </Typography>
          {onClose && (
            <Button
              size="sm"
              variant="plain"
              startDecorator={<XIcon size={16} />}
              onClick={onClose}
            >
              Cancel
            </Button>
          )}
        </Stack>

        {model ? (
          <Typography level="body-sm" sx={{ fontWeight: 600 }}>
            {model.name}
          </Typography>
        ) : (
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Select a model to see VRAM requirements.
          </Typography>
        )}

        <Divider />

        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          <Chip size="sm" variant="soft">
            dtype: {DEFAULT_SETTINGS.dtype}
          </Chip>
          <Chip size="sm" variant="soft">
            batch: {DEFAULT_SETTINGS.batch}
          </Chip>
          <Chip size="sm" variant="soft">
            seq: {DEFAULT_SETTINGS.seqLen}
          </Chip>
          <Chip size="sm" variant="soft">
            KV cache: {DEFAULT_SETTINGS.noKv ? 'off' : 'on'}
          </Chip>
        </Stack>

        {model && !hasModelId && (
          <Typography level="body-sm" color="danger">
            This model does not have a Hugging Face ID to estimate VRAM.
          </Typography>
        )}

        {model && hasModelId && vramLoading && (
          <Box>
            <LinearProgress />
            <Typography level="body-xs" sx={{ mt: 1, color: 'text.secondary' }}>
              Estimating VRAM…
            </Typography>
          </Box>
        )}

        {model && hasModelId && vramError && !vramLoading && (
          <Typography level="body-sm" color="danger">
            Failed to estimate VRAM. Please try again.
          </Typography>
        )}

        {model &&
          hasModelId &&
          !vramError &&
          vramStatus &&
          vramStatus !== 'success' &&
          !vramLoading && (
            <Typography
              level="body-sm"
              color={isUnauthorized ? 'warning' : 'danger'}
            >
              {vramMessage ||
                (isUnauthorized
                  ? 'This model requires a Hugging Face token.'
                  : 'Failed to estimate VRAM.')}
            </Typography>
          )}

        {model && hasModelId && vramStatus === 'success' && vramData && (
          <Stack spacing={1}>
            <StatRow label="Total" value={formatGigabytes(totalGb)} />
            <StatRow
              label="Weights"
              value={formatGigabytes(weightsGb)}
            />
            <StatRow
              label="KV cache"
              value={formatGigabytes(kvCacheGb)}
            />
            <StatRow
              label="Activations"
              value={formatGigabytes(activationsGb)}
            />

            {vramData.raw && (
              <Accordion variant="plain" defaultExpanded={false}>
                <AccordionSummary>Raw estimate</AccordionSummary>
                <AccordionDetails>
                  <Sheet
                    variant="soft"
                    sx={{
                      p: 1,
                      borderRadius: 'sm',
                      maxHeight: 240,
                      overflow: 'auto',
                    }}
                  >
                    <Typography level="body-xs" sx={{ whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(vramData.raw, null, 2)}
                    </Typography>
                  </Sheet>
                </AccordionDetails>
              </Accordion>
            )}
          </Stack>
        )}

        <Divider />

        <Typography level="title-sm">System Check</Typography>
        {!hasServerStats ? (
          <Chip color="neutral" size="sm" variant="soft">
            System stats unavailable
          </Chip>
        ) : systemTotalGb || systemFreeGb ? (
          <Stack spacing={1}>
            {typeof unifiedMemoryGb === 'number' && unifiedMemoryGb > 0 ? (
              <StatRow
                label="Unified memory"
                value={formatGigabytes(unifiedMemoryGb)}
              />
            ) : (
              <>
                <StatRow
                  label="Largest GPU (total)"
                  value={
                    maxTotalBytes > 0 ? formatBytes(maxTotalBytes) : '—'
                  }
                />
                <StatRow
                  label="Largest GPU (free)"
                  value={maxFreeBytes > 0 ? formatBytes(maxFreeBytes) : '—'}
                />
              </>
            )}
            <StatRow
              label="Estimate"
              value={estimateGb ? formatGigabytes(estimateGb) : '—'}
            />
            {canRun !== null && (
              <Chip color={canRun ? 'success' : 'danger'} size="sm">
                {canRun ? 'Fits on current system' : 'Exceeds current system'}
              </Chip>
            )}
            {canRun === null && (
              <Chip color="neutral" size="sm" variant="soft">
                Unable to determine fit
              </Chip>
            )}
          </Stack>
        ) : (
          <Chip color="warning" size="sm" variant="soft">
            No GPU detected
          </Chip>
        )}
      </Stack>
    </Sheet>
  );

  if (typeof open === 'boolean') {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        anchor="right"
        variant="plain"
        sx={{
          '--Drawer-transitionDuration': '0.25s',
        }}
      >
        {sidebarContent}
      </Drawer>
    );
  }

  return sidebarContent;
}