import { useState } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Divider,
  Box,
  Stack,
  Button,
  CircularProgress,
} from '@mui/joy';
import {
  DatabaseIcon,
  FileTextIcon,
  ArchiveIcon,
  Download,
  CpuIcon,
} from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useSWRWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import ArtifactsSection from './ArtifactsSection';
import { downloadAllArtifacts } from './artifactUtils';
import DatasetsSection from './DatasetsSection';
import ModelsSection from './ModelsSection';
import ArtifactPreviewPane, { PreviewableItem } from './ArtifactPreviewPane';
import ProfilingReport from '../ProfilingReport';
import FileBrowserModal from '../FileBrowserModal';
import MetricsSection from '../../Jobs/MetricsSection';

interface JobArtifactsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string | null;
}

export function JobArtifactsBody({
  jobId,
  showTitle,
}: {
  jobId: string;
  showTitle: boolean;
}) {
  const { experimentInfo } = useExperimentInfo();
  const [modelsCount, setModelsCount] = useState<number | null>(null);
  const [datasetsCount, setDatasetsCount] = useState<number | null>(null);
  const [artifactsCount, setArtifactsCount] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<PreviewableItem | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);

  const handleDownloadAll = async () => {
    try {
      setIsDownloadingAll(true);
      await downloadAllArtifacts(experimentInfo?.id, jobId);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const countLabel = (count: number | null) =>
    count !== null ? ` (${count})` : '';

  return (
    <>
      {showTitle && (
        <Typography level="h2" sx={{ mb: 2, mr: 4 }}>
          Artifacts for Job {jobId}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flex: 1, gap: 2, overflow: 'hidden' }}>
        <Box
          sx={{
            flex: '0 0 30%',
            overflowY: 'auto',
            overflowX: 'hidden',
            minWidth: 0,
          }}
        >
          <Stack spacing={3}>
            <section>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 1 }}
              >
                <DatabaseIcon size={18} />
                <Typography level="title-md">
                  Models{countLabel(modelsCount)}
                </Typography>
              </Stack>
              <ModelsSection
                jobId={jobId}
                renderContentOnly
                onCountLoaded={setModelsCount}
              />
            </section>

            <Divider />

            <section>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 1 }}
              >
                <FileTextIcon size={18} />
                <Typography level="title-md">
                  Datasets{countLabel(datasetsCount)}
                </Typography>
              </Stack>
              <DatasetsSection
                jobId={jobId}
                renderContentOnly
                onCountLoaded={setDatasetsCount}
              />
            </section>

            <Divider />

            <section>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 1 }}
              >
                <ArchiveIcon size={18} />
                <Typography level="title-md">
                  Other Artifacts{countLabel(artifactsCount)}
                </Typography>
                {artifactsCount !== null && artifactsCount > 0 && (
                  <Button
                    size="sm"
                    variant="soft"
                    color="primary"
                    startDecorator={!isDownloadingAll && <Download size={14} />}
                    loading={isDownloadingAll}
                    onClick={handleDownloadAll}
                    sx={{ ml: 'auto' }}
                  >
                    Download All
                  </Button>
                )}
              </Stack>
              <ArtifactsSection
                jobId={jobId}
                renderContentOnly
                onCountLoaded={setArtifactsCount}
                onPreviewItem={setPreviewItem}
                selectedFilename={previewItem?.filename ?? null}
              />
            </section>

            <Divider />

            <section>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 1 }}
              >
                <CpuIcon size={18} />
                <Typography level="title-md">Profiling</Typography>
              </Stack>
              <ProfilingReport jobId={jobId} />
            </section>
          </Stack>
        </Box>

        <Divider orientation="vertical" />

        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <ArtifactPreviewPane
            item={previewItem}
            onClose={() => setPreviewItem(null)}
          />
        </Box>
      </Box>
      <Divider sx={{ mt: 2 }} />
      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={1}
        sx={{ mt: 2 }}
      >
        <Button variant="outlined" onClick={() => setMetricsOpen(true)}>
          View Metrics
        </Button>
        <Button variant="outlined" onClick={() => setFileBrowserOpen(true)}>
          View All Files
        </Button>
      </Stack>
      <FileBrowserModal
        mode="job"
        open={fileBrowserOpen}
        onClose={() => setFileBrowserOpen(false)}
        jobId={jobId}
      />
      <Modal open={metricsOpen} onClose={() => setMetricsOpen(false)}>
        <ModalDialog sx={{ width: '70vw', height: '70vh', overflow: 'auto' }}>
          <ModalClose />
          <Typography level="h3" sx={{ mb: 2 }}>
            Metrics for Job {jobId}
          </Typography>
          <MetricsSectionForModal jobId={jobId} />
        </ModalDialog>
      </Modal>
    </>
  );
}

function MetricsSectionForModal({ jobId }: { jobId: string }) {
  const { experimentInfo } = useExperimentInfo();
  const { data: job } = useSWRWithAuth(
    experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.Get(String(experimentInfo.id), jobId)
      : null,
  );
  if (!job) {
    return <CircularProgress />;
  }
  return <MetricsSection job={job} />;
}

export default function JobArtifactsModal({
  open,
  onClose,
  jobId,
}: JobArtifactsModalProps) {
  if (!jobId) {
    return null;
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: '90vw',
          height: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <JobArtifactsBody jobId={jobId} showTitle />
      </ModalDialog>
    </Modal>
  );
}
