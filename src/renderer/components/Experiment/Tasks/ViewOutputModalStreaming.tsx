import React from 'react';
import { Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';
import EmbeddableStreamingOutput from './EmbeddableStreamingOutput';

const TAB_LABELS: Record<string, string> = {
  output: 'Task Output',
  provider: 'Provider Logs',
};

interface ViewOutputModalStreamingProps {
  jobId: number;
  setJobId: (jobId: number) => void;
  /** Which tabs to show, in order. e.g. ['output', 'provider'] or ['provider'] for interactive tasks. */
  tabs?: ('output' | 'provider')[];
}

function ViewOutputModalStreaming({
  jobId,
  setJobId,
  tabs = ['output', 'provider'],
}: ViewOutputModalStreamingProps) {
  if (jobId === -1) {
    return null;
  }

  const showTabList = tabs.length > 1;
  const title = showTabList
    ? `Output from job: ${jobId}`
    : `${TAB_LABELS[tabs[0]] ?? 'Output'}: ${jobId}`;

  return (
    <Modal
      open={jobId !== -1}
      onClose={() => {
        setJobId(-1);
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
        <EmbeddableStreamingOutput jobId={jobId} tabs={tabs} />
      </ModalDialog>
    </Modal>
  );
}

ViewOutputModalStreaming.defaultProps = {
  tabs: ['output', 'provider'],
};

export default ViewOutputModalStreaming;
