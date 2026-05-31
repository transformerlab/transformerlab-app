import { useState } from 'react';
import { IconButton, Modal, ModalClose, ModalDialog } from '@mui/joy';
import { Share2Icon } from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import JobsChartView from './JobsChartView';
import PublicShareLinkPopover from '../PublicShareLinkPopover';

interface JobsChartModalProps {
  open: boolean;
  onClose: () => void;
  jobs: unknown[];
}

export default function JobsChartModal({
  open,
  onClose,
  jobs,
}: JobsChartModalProps) {
  const { experimentId } = useExperimentInfo();
  const [shareOpen, setShareOpen] = useState(false);
  const shareButton = (
    <IconButton
      size="sm"
      variant="outlined"
      onClick={() => setShareOpen(true)}
      title="Public share link"
    >
      <Share2Icon size={14} />
    </IconButton>
  );
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', maxWidth: '1200px', height: '85vh' }}>
        <ModalClose />
        <JobsChartView
          jobs={jobs}
          experimentId={experimentId ?? undefined}
          onClose={onClose}
          headerActions={shareButton}
        />
        <Modal open={shareOpen} onClose={() => setShareOpen(false)}>
          <ModalDialog sx={{ minWidth: 400 }}>
            <ModalClose />
            <PublicShareLinkPopover
              experimentId={String(experimentId ?? '')}
              kind="chart"
            />
          </ModalDialog>
        </Modal>
      </ModalDialog>
    </Modal>
  );
}
