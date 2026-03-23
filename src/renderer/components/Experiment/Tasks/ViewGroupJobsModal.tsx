import React from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import JobsList from './JobsList';
import { jobChipColor } from 'renderer/lib/utils';

interface ViewGroupJobsModalProps {
  open: boolean;
  onClose: () => void;
  parentJob: any | null;
  childJobs: any[];
  loading?: boolean;
  onDeleteJob?: (jobId: string) => void;
  onViewOutput?: (jobId: string) => void;
  onViewTensorboard?: (jobId: string) => void;
  onViewCheckpoints?: (jobId: string) => void;
  onViewArtifacts?: (jobId: string) => void;
  onViewEvalImages?: (jobId: string) => void;
  onViewEvalResults?: (jobId: string) => void;
  onViewGeneratedDataset?: (jobId: string, datasetId: string) => void;
  onViewInteractive?: (jobId: string) => void;
  onViewJobDatasets?: (jobId: string) => void;
  onViewJobModels?: (jobId: string) => void;
  onViewFileBrowser?: (jobId: string) => void;
  onViewSweepOutput?: (jobId: string) => void;
  onViewSweepResults?: (jobId: string) => void;
  onViewTrackio?: (jobId: string) => void;
}

export default function ViewGroupJobsModal({
  open,
  onClose,
  parentJob,
  childJobs,
  loading = false,
  onDeleteJob,
  onViewOutput,
  onViewTensorboard,
  onViewCheckpoints,
  onViewArtifacts,
  onViewEvalImages,
  onViewEvalResults,
  onViewGeneratedDataset,
  onViewInteractive,
  onViewJobDatasets,
  onViewJobModels,
  onViewFileBrowser,
  onViewSweepOutput,
  onViewSweepResults,
  onViewTrackio,
}: ViewGroupJobsModalProps) {
  if (!open || !parentJob) return null;

  const jobData = parentJob?.job_data || {};
  const status = parentJob?.status || 'UNKNOWN';

  const total = Number(jobData.group_total || 0);
  const completed = Number(jobData.group_completed || 0);
  const failed = Number(jobData.group_failed || 0);
  const queued = Number(jobData.group_queued || 0);
  const running = Number(jobData.group_running || 0);
  const progress = Math.max(
    0,
    Math.min(100, Number(jobData.group_progress || 0)),
  );

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        aria-labelledby="group-jobs-modal-title"
        minWidth={600}
        sx={{ maxWidth: '90vw' }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          gap={2}
          sx={{ pb: 1 }}
        >
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography id="group-jobs-modal-title" level="title-md">
              Group {parentJob.id}
            </Typography>
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
          <ModalClose />
        </Stack>

        <Box sx={{ py: 1 }}>
          <LinearProgress determinate value={progress} />
          <Typography level="body-sm" sx={{ mt: 0.5 }}>
            {completed + failed}/{total} done • running {running} • queued{' '}
            {queued}
            {failed > 0 ? ` • ${failed} failed` : ''}
          </Typography>
        </Box>

        <Box sx={{ mt: 1 }}>
          <Typography level="title-sm" sx={{ mb: 1 }}>
            Child jobs
          </Typography>

          {loading ? (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ py: 4 }}
            >
              <CircularProgress size="sm" />
              <Typography level="body-md">Loading child jobs...</Typography>
            </Stack>
          ) : (
            <JobsList
              jobs={childJobs as any}
              loading={false}
              onDeleteJob={onDeleteJob}
              onViewOutput={onViewOutput}
              onViewTensorboard={onViewTensorboard}
              onViewCheckpoints={onViewCheckpoints}
              onViewArtifacts={onViewArtifacts}
              onViewEvalImages={onViewEvalImages}
              onViewEvalResults={onViewEvalResults}
              onViewGeneratedDataset={onViewGeneratedDataset}
              onViewInteractive={onViewInteractive}
              onViewJobDatasets={onViewJobDatasets}
              onViewJobModels={onViewJobModels}
              onViewFileBrowser={onViewFileBrowser}
              onViewSweepOutput={onViewSweepOutput}
              onViewSweepResults={onViewSweepResults}
              onViewTrackio={onViewTrackio}
            />
          )}
        </Box>
      </ModalDialog>
    </Modal>
  );
}
