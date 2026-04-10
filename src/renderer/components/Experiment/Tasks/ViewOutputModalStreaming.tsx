import React from 'react';
import { Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';
import EmbeddableStreamingOutput from './EmbeddableStreamingOutput';

const TAB_LABELS: Record<string, string> = {
  output: 'Lab SDK Output',
  provider: 'Machine Logs',
  skypilot: 'SkyPilot Logs',
};

interface ViewOutputModalStreamingProps {
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  /** Which tabs to show, in order. e.g. ['output', 'provider'] or ['provider'] for interactive tasks. */
  tabs?: ('output' | 'provider' | 'skypilot')[];
  /** Current job status string (e.g. 'RUNNING', 'COMPLETE'). */
  jobStatus?: string;
  /** The SkyPilot request ID for the job. */
  skypilotRequestId?: string;
}

function ViewOutputModalStreaming({
  jobId,
  setJobId,
  tabs = ['output', 'provider'],
  jobStatus = '',
  skypilotRequestId,
}: ViewOutputModalStreamingProps) {
  if (!jobId) return null;

  const showTabList = tabs.length > 1;
  const title = showTabList
    ? `Output from job: ${jobId}`
    : `${TAB_LABELS[tabs[0]] ?? 'Output'}: ${jobId}`;

  return (
    <Modal
      open={jobId !== null}
      onClose={() => {
        setJobId(null);
      }}
    >
      <ModalDialog
        sx={{
          width: '80vw',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          {title}
        </Typography>
        <EmbeddableStreamingOutput
          jobId={jobId}
          tabs={tabs}
          jobStatus={jobStatus}
          skypilotRequestId={skypilotRequestId}
        />
      </ModalDialog>
    </Modal>
  );
}

ViewOutputModalStreaming.defaultProps = {
  tabs: ['output', 'provider'],
  jobStatus: '',
};

export default ViewOutputModalStreaming;
