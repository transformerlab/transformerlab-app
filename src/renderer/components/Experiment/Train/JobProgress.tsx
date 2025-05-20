import { Chip, IconButton, LinearProgress, Stack, Typography } from '@mui/joy';
import { StopCircleIcon } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { jobChipColor } from 'renderer/lib/utils';
dayjs.extend(relativeTime);

var duration = require('dayjs/plugin/duration');
dayjs.extend(duration);
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function JobProgress({ job }) {
  return (
    <Stack>
      {job?.status == 'RUNNING' ? (
        <>
          <Stack direction={'row'} alignItems="center" gap={1}>
            <Chip
              sx={{
                backgroundColor: jobChipColor(job.status),
                color: 'var(--joy-palette-neutral-800)',
              }}
            >
              {job.status}
            </Chip>
            {job.progress == '-1'
              ? ''
              : Number.parseFloat(job.progress).toFixed(1) + '%'}
            <LinearProgress
              determinate
              value={job.progress}
              sx={{ my: 1 }}
            ></LinearProgress>
            <IconButton
              color="danger"
              onClick={async () => {
                confirm('Are you sure you want to stop this job?') &&
                  (await fetch(chatAPI.Endpoints.Jobs.Stop(job.id)));
              }}
            >
              <StopCircleIcon size="20px" />
            </IconButton>
          </Stack>
          {/* Add smaller sweep subprogress bar when job.progress is -1 */}
          {job.progress == '-1' &&
            job?.job_data?.hasOwnProperty('sweep_subprogress') && (
              <Stack
                direction={'row'}
                alignItems="center"
                gap={1}
                sx={{ mt: 0.5 }}
              >
                {/* <Typography level="body-sm">
                  Sweep progress {job.job_data.sweep_current}/
                  {job.job_data.sweep_total}:
                </Typography> */}
                <Chip
                  size="sm"
                  variant="soft"
                  color="primary"
                  sx={{
                    fontSize: 'var(--joy-fontSize-xs)',
                    height: 'auto',
                    py: 0.5,
                  }}
                >
                  Sweep {job.job_data.sweep_current}/{job.job_data.sweep_total}
                </Chip>
                <LinearProgress
                  determinate
                  value={job.job_data.sweep_subprogress}
                  sx={{
                    my: 0.5,
                    height: '4px', // Make it smaller than the main progress bar
                  }}
                />
                {Number.parseFloat(job.job_data.sweep_subprogress).toFixed(1) +
                  '%'}
              </Stack>
            )}
          {job?.job_data?.start_time && (
            <>
              Started:{' '}
              {dayjs(job?.job_data?.start_time).format('MMM D, YYYY HH:mm:ss')}
            </>
          )}
        </>
      ) : (
        <Stack direction={'column'} justifyContent={'space-between'}>
          <>
            <Chip
              sx={{
                backgroundColor: jobChipColor(job.status),
                color: 'var(--joy-palette-neutral-800)',
              }}
            >
              {job.status}
              {job.progress == '-1'
                ? ''
                : ' - ' + Number.parseFloat(job.progress).toFixed(1) + '%'}
            </Chip>
            {job?.job_data?.start_time && (
              <>
                Started:{' '}
                {dayjs(job?.job_data?.start_time).format(
                  'MMM D, YYYY HH:mm:ss',
                )}{' '}
                <br />
              </>
            )}
            {job?.job_data?.end_time && job?.job_data?.end_time && (
              <>
                Completed in:{' '}
                {dayjs
                  .duration(
                    dayjs(job?.job_data?.end_time).diff(
                      dayjs(job?.job_data?.start_time),
                    ),
                  )
                  .humanize()}{' '}
                <br />
              </>
            )}
            {job?.status == 'COMPLETE' &&
              (job?.job_data?.completion_status ? (
                <>
                  {/* Final Status:{' '} */}
                  {job?.job_data?.completion_status == 'success' ? (
                    <Typography level="body-sm" color="success">
                      Success: {job?.job_data?.completion_details}
                    </Typography>
                  ) : (
                    <Typography level="body-sm" color="danger">
                      Failure: {job?.job_data?.completion_details}
                    </Typography>
                  )}
                </>
              ) : (
                /* If we don't have a status, assume it failed */
                <Typography level="body-sm" color="neutral">
                  No job completion status. Task may have failed. View output
                  for details
                </Typography>
              ))}
          </>
        </Stack>
      )}
    </Stack>
  );
}
