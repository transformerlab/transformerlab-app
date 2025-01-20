import {
    Box,
    Chip,
    LinearProgress,
    Sheet,
    Stack,
    Typography,
} from '@mui/joy';

import {
    clamp,
    formatBytes,
} from '../../lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

import useSWR from 'swr';
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DownloadProgressBox({ jobId, assetName }) {

  const { data: downloadProgress } = useSWR(
    jobId && jobId != '-1'
            ? chatAPI.Endpoints.Jobs.Get(jobId)
            : null,
        fetcher,
    { refreshInterval: 2000 }
  );

  return (
    <>
      {jobId && (
        <Box>
          <Stack>
            <Sheet
              variant="soft"
              color="warning"
              sx={{ my: 1, padding: 2, borderRadius: '8px' }}
            >
              <Typography level="title-sm" sx={{ pb: 1 }}>
                Downloading
                <Chip variant="soft">{assetName}</Chip>
                {' - '}
                {downloadProgress?.job_data?.total_size_of_model_in_mb >
                  0 && (
                  <>
                    {clamp(
                      Number.parseFloat(downloadProgress?.progress),
                      0,
                      100
                    ).toFixed(0)}
                    % {' - '}
                  </>
                )}
                <>
                  {downloadProgress?.job_data?.downloaded != 0
                    ? formatBytes(
                        downloadProgress?.job_data?.downloaded *
                          1024 *
                          1024
                      )
                    : 'Download Starting'}

                  {downloadProgress?.job_data?.total_size_of_model_in_mb >
                    0 && (
                    <>
                    {'/'}
                    {formatBytes(
                      downloadProgress?.job_data?.total_size_of_model_in_mb
                      * 1024
                      * 1024
                    )}
                    </>
                  )}
                  ↓
                </>
              </Typography>
              {downloadProgress?.progress !== -1 && (
                <>
                  {downloadProgress?.job_data?.total_size_of_model_in_mb >
                  0 ? (
                    <LinearProgress
                      determinate
                      value={clamp(downloadProgress?.progress, 0, 100)}
                    />
                  ) : (
                    <LinearProgress />
                  )}
                </>
              )}
            </Sheet>
          </Stack>
        </Box>
      )}
    </>
  );
}