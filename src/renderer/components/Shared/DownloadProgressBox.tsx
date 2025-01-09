import {
    Box,
    Chip,
    LinearProgress,
    Sheet,
    Stack,
    Typography,
} from '@mui/joy';

import {
    formatBytes,
} from '../../lib/utils';

import useSWR from 'swr';
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DownloadProgressBox({ jobId, assetName }) {

  const { data: modelDownloadProgress } = useSWR(
    assetName && jobId != '-1'
            ? chatAPI.Endpoints.Jobs.Get(jobId)
            : null,
        fetcher,
    { refreshInterval: 2000 }
  );

  return (
    <>
      {jobId && (
        <Box>
          {/* <Typography level="title-md" sx={{ mt: 2 }}>
            Downloading
          </Typography> */}
          <Stack>
            {/* Download Progress: {JSON.stringify(modelDownloadProgress)}
            Currently Downloading: {JSON.stringify(currentlyDownloading)}&nbsp;
            Job: {JSON.stringify(jobId)} */}
            <Sheet
              variant="soft"
              color="warning"
              sx={{ my: 1, padding: 2, borderRadius: '8px' }}
            >
              <Typography level="title-sm" sx={{ pb: 1 }}>
                Downloading
                <Chip variant="soft">{assetName}</Chip>
                {' - '}
                {modelDownloadProgress?.job_data?.total_size_of_model_in_mb >
                  0 && (
                  <>
                    {clamp(
                      Number.parseFloat(modelDownloadProgress?.progress),
                      0,
                      100
                    ).toFixed(0)}
                    % {' - '}
                  </>
                )}
                <>
                  {modelDownloadProgress?.job_data?.downloaded != 0
                    ? formatBytes(
                        modelDownloadProgress?.job_data?.downloaded *
                          1024 *
                          1024
                      )
                    : 'Download Starting'}
                  ↓
                </>
              </Typography>
              {modelDownloadProgress?.progress !== -1 && (
                <>
                  {modelDownloadProgress?.job_data?.total_size_of_model_in_mb >
                  0 ? (
                    <LinearProgress
                      determinate
                      value={clamp(modelDownloadProgress?.progress, 0, 100)}
                    />
                  ) : (
                    <LinearProgress />
                  )}
                </>
              )}
            </Sheet>
          </Stack>
          {/* downloadprogress: {JSON.stringify(modelDownloadProgress)} - currdown:{' '}
          {JSON.stringify(currentlyDownloading)} - jobid:{' '}
          {JSON.stringify(jobId)} */}
        </Box>
      )}
    </>
  );
}