import {
  Box,
  Chip,
  Sheet,
  Stack,
  Typography,
  LinearProgress,
  CircularProgress,
  Divider,
} from '@mui/joy';
import { ArrowDownIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import { useRef } from 'react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { clamp, formatBytes } from '../../lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';
import { useNotification } from './NotificationSystem';

const getStatusIcon = (status) => {
  switch (status) {
    case 'COMPLETE':
      return <CheckCircle2Icon color="green" />;
    case 'FAILED':
      return <XCircleIcon color="red" />;
    case 'RUNNING':
    default:
      return <CircularProgress size="sm" color="success" />;
  }
};

export default function DownloadProgressBox({
  jobId,
  assetName,
  experimentId,
}) {
  const { data: downloadProgress } = useSWR(
    jobId && jobId !== '-1'
      ? chatAPI.Endpoints.Jobs.Get(experimentId, jobId)
      : null,
    fetcher,
    { refreshInterval: 2000 },
  );

  const { addNotification } = useNotification();
  const hasNotifiedRef = useRef<string | null>(null);

  // Show notification when download completes
  const currentStatus = downloadProgress?.status;
  const jobIdString = String(jobId);

  if (currentStatus === 'COMPLETE' && hasNotifiedRef.current !== jobIdString) {
    const modelName = downloadProgress?.job_data?.model || assetName || 'Model';
    addNotification({
      type: 'success',
      message: `Model "${modelName}" downloaded successfully`,
    });
    hasNotifiedRef.current = jobIdString;
  } else if (
    currentStatus === 'RUNNING' &&
    hasNotifiedRef.current === jobIdString
  ) {
    // Reset for a new download
    hasNotifiedRef.current = null;
  }

  if (!jobId) return null;

  const progress = clamp(
    Number.isFinite(Number(downloadProgress?.progress))
      ? Number(downloadProgress?.progress)
      : 0,
    0,
    100,
  );

  const downloaded = Number.isFinite(
    Number(downloadProgress?.job_data?.downloaded),
  )
    ? Number(downloadProgress?.job_data?.downloaded)
    : 0;
  const total = Number.isFinite(
    Number(downloadProgress?.job_data?.total_size_of_model_in_mb),
  )
    ? Number(downloadProgress?.job_data?.total_size_of_model_in_mb)
    : 0;
  const downloadedBytes = downloaded * 1024 * 1024;
  const totalBytes = total * 1024 * 1024;

  // Get file counts if available
  const filesDownloaded = Number.isFinite(
    Number(downloadProgress?.job_data?.files_downloaded),
  )
    ? Number(downloadProgress?.job_data?.files_downloaded)
    : null;
  const filesTotal = Number.isFinite(
    Number(downloadProgress?.job_data?.files_total),
  )
    ? Number(downloadProgress?.job_data?.files_total)
    : null;

  // Calculate progress based on files if available, otherwise use bytes-based progress
  const calculatedProgress =
    filesDownloaded !== null && filesTotal !== null && filesTotal > 0
      ? (filesDownloaded / filesTotal) * 100
      : progress;

  const progressPercent = Number.isFinite(calculatedProgress)
    ? Math.round(calculatedProgress)
    : 0;

  return (
    <Box>
      <Stack>
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ my: 1, px: 3, py: 2, borderRadius: 'md', boxShadow: 'md' }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            {getStatusIcon(downloadProgress?.status)}
            <Typography level="title-md" fontWeight="lg">
              Downloading <Chip variant="outlined">{assetName}</Chip>
            </Typography>
          </Stack>

          <Box mt={1}>
            <Typography level="body-xs" sx={{ mb: 1, color: 'text.secondary' }}>
              {filesDownloaded !== null && filesTotal !== null
                ? `${filesDownloaded}/${filesTotal} files downloaded`
                : downloaded > 0
                  ? `${formatBytes(downloadedBytes)}${total > 0 ? ` / ${formatBytes(totalBytes)}` : ''}`
                  : 'Downloading...'}
              <ArrowDownIcon size="16px" style={{ verticalAlign: 'middle' }} />
            </Typography>
            <Divider sx={{ mb: 1 }} />
            {downloadProgress?.progress !== -1 && (
              <Box sx={{ position: 'relative' }}>
                <LinearProgress
                  determinate
                  value={calculatedProgress}
                  color="success"
                  sx={(theme) => ({
                    height: 24,
                    borderRadius: 5,
                    '&::before': {
                      transition: 'width 2s cubic-bezier(0.4, 0, 0.2, 1)',
                    },
                    '--LinearProgress-radius': '5px',
                    '--LinearProgress-thickness': '24px',
                    '--LinearProgress-progressColor':
                      theme.vars.palette.success[500],
                    '--LinearProgress-trackColor':
                      theme.vars.palette.neutral.plainDisabledColor,
                    '& .MuiLinearProgress-bar1Determinate': {},
                  })}
                />
                <Typography
                  level="body-xs"
                  sx={(theme) => ({
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontWeight: 'bold',
                    color:
                      calculatedProgress > 50
                        ? theme.vars.palette.common.white
                        : theme.vars.palette.text.primary,
                  })}
                >
                  {filesDownloaded !== null && filesTotal !== null
                    ? `${filesDownloaded}/${filesTotal} files`
                    : Number.isFinite(progressPercent)
                      ? `${progressPercent}%`
                      : 'Loading...'}
                </Typography>
              </Box>
            )}
          </Box>
        </Sheet>
      </Stack>
    </Box>
  );
}
