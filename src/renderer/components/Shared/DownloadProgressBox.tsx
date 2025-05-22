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
import { clamp, formatBytes } from '../../lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { useEffect, useRef, useState } from 'react';

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

  const rawProgress = clamp(
    Number.isFinite(Number(downloadProgress?.progress))
      ? Number(downloadProgress?.progress)
      : 0,
    0,
    100,
  );

  const [animatedProgress, setAnimatedProgress] = useState(rawProgress);
  const rafRef = useRef();

  useEffect(() => {
    const update = () => {
      setAnimatedProgress((prev) => {
        const next = prev + (rawProgress - prev) * 0.2;
        if (Math.abs(next - rawProgress) < 0.5) return rawProgress;
        rafRef.current = requestAnimationFrame(update);
        return next;
      });
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rawProgress]);

  const progressPercent = Math.round(animatedProgress);
  const downloaded = downloadProgress?.job_data?.downloaded || 0;
  const total = downloadProgress?.job_data?.total_size_of_model_in_mb || 0;

  return (
    jobId && (
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
              <Typography
                level="body-xs"
                sx={{ mb: 1, color: 'text.secondary' }}
              >
                {downloaded !== 0
                  ? formatBytes(downloaded * 1024 * 1024)
                  : 'Download Starting'}
                {total > 0 && ` / ${formatBytes(total * 1024 * 1024)} `}
                <ArrowDownIcon
                  size="16px"
                  style={{ verticalAlign: 'middle' }}
                />
              </Typography>
              <Divider sx={{ mb: 1 }} />
              {downloadProgress?.progress !== -1 && (
                <Box sx={{ position: 'relative' }}>
                  <LinearProgress
                    determinate
                    value={animatedProgress}
                    color="success"
                    sx={(theme) => ({
                      height: 24,
                      borderRadius: 5,
                      transition: 'all 0.6s ease-in-out',
                      '--LinearProgress-radius': '5px',
                      '--LinearProgress-thickness': '24px',
                      '--LinearProgress-progressColor':
                        theme.vars.palette.success[500],
                      '--LinearProgress-trackColor':
                        theme.vars.palette.neutral.plainDisabledColor,
                      '& .MuiLinearProgress-bar1Determinate': {
                        transition: 'transform 0.6s ease-in-out',
                        transformOrigin: 'left',
                      },
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
    )
  );
}
