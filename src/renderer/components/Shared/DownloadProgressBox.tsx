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
import useSWR from 'swr';
import { clamp, formatBytes } from '../../lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

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

export default function DownloadProgressBox({ jobId, assetName }) {
  const { data: downloadProgress } = useSWR(
    jobId && jobId !== '-1' ? chatAPI.Endpoints.Jobs.Get(jobId) : null,
    fetcher,
    { refreshInterval: 2000 },
  );

  if (!jobId) return null;

  const progress = clamp(
    Number.isFinite(Number(downloadProgress?.progress))
      ? Number(downloadProgress?.progress)
      : 0,
    0,
    100,
  );

  const progressPercent = Math.round(progress);
  const downloaded = downloadProgress?.job_data?.downloaded || 0;
  const total = downloadProgress?.job_data?.total_size_of_model_in_mb || 0;
  const downloadedBytes = downloaded * 1024 * 1024;
  const totalBytes = total * 1024 * 1024;

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
              {downloaded !== 0
                ? formatBytes(downloadedBytes)
                : 'Download Starting'}
              {total > 0 && ` / ${formatBytes(totalBytes)} `}
              <ArrowDownIcon size="16px" style={{ verticalAlign: 'middle' }} />
            </Typography>
            <Divider sx={{ mb: 1 }} />
            {downloadProgress?.progress !== -1 && (
              <Box sx={{ position: 'relative' }}>
                <LinearProgress
                  determinate
                  value={progress}
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
                      progressPercent > 50
                        ? theme.vars.palette.common.white
                        : theme.vars.palette.text.primary,
                  })}
                >
                  {progressPercent}%
                </Typography>
              </Box>
            )}
          </Box>
        </Sheet>
      </Stack>
    </Box>
  );
}
