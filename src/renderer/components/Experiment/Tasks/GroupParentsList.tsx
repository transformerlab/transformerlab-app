import React from 'react';
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Skeleton,
  Stack,
  Table,
  Typography,
} from '@mui/joy';
import { jobChipColor } from 'renderer/lib/utils';

interface GroupParentsListProps {
  groups: any[];
  loading: boolean;
  onOpenGroup: (jobId: string) => void;
}

const toNumber = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function GroupParentsList({
  groups,
  loading,
  onOpenGroup,
}: GroupParentsListProps) {
  if (loading) {
    return (
      <Table style={{ tableLayout: 'auto' }} stickyHeader>
        <tbody>
          {[1, 2, 3, 4, 5].map((i) => (
            <tr key={i}>
              <td>
                <Skeleton variant="text" level="body-md" width={80} />
              </td>
              <td>
                <Skeleton variant="text" level="body-sm" width={140} />
              </td>
              <td style={{ width: 240 }}>
                <Skeleton variant="rectangular" width={220} height={12} />
              </td>
              <td style={{ textAlign: 'right' }}>
                <Skeleton variant="rectangular" width={90} height={28} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  }

  return (
    <Table style={{ tableLayout: 'auto' }} stickyHeader>
      <tbody style={{ overflow: 'auto', height: '100%' }}>
        {groups?.length > 0 ? (
          groups.map((job) => {
            const jobData = job?.job_data || {};
            const total = toNumber(jobData.group_total, 0);
            const completed = toNumber(jobData.group_completed, 0);
            const failed = toNumber(jobData.group_failed, 0);
            const queued = toNumber(jobData.group_queued, 0);
            const progress = Math.max(
              0,
              Math.min(100, toNumber(jobData.group_progress, 0)),
            );

            const status = job?.status || 'UNKNOWN';
            return (
              <tr key={job.id}>
                <td style={{ verticalAlign: 'top', border: 'none' }}>
                  <b>{job.id}</b>
                </td>
                <td style={{ verticalAlign: 'top', border: 'none' }}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Chip
                      size="sm"
                      sx={{
                        backgroundColor: jobChipColor(status),
                        color: 'var(--joy-palette-neutral-800)',
                      }}
                    >
                      {status}
                    </Chip>
                  </Stack>
                  <Typography level="body-xs" sx={{ mt: 0.5 }}>
                    {completed + failed}/{total} done (running{' '}
                    {jobData.group_running || 0}, queued {queued})
                  </Typography>
                </td>
                <td
                  style={{ verticalAlign: 'top', border: 'none', width: 260 }}
                >
                  <Box sx={{ mt: 0.5 }}>
                    <LinearProgress determinate value={progress} />
                    <Typography level="body-xs" sx={{ mt: 0.5 }}>
                      {progress}%{failed > 0 ? ` (${failed} failed)` : ''}
                    </Typography>
                  </Box>
                </td>
                <td
                  style={{
                    verticalAlign: 'top',
                    border: 'none',
                    width: 'fit-content',
                    textAlign: 'right',
                  }}
                >
                  <Button
                    size="sm"
                    variant="plain"
                    onClick={() => onOpenGroup(String(job.id))}
                  >
                    Track Group
                  </Button>
                </td>
              </tr>
            );
          })
        ) : (
          <tr>
            <td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>
              <Typography level="body-md" sx={{ color: 'neutral.500' }}>
                No groups found
              </Typography>
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  );
}
