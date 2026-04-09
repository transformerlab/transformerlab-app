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
} from '@mui/joy';
import {
  DatabaseIcon,
  FileTextIcon,
  ArchiveIcon,
  Download,
  CpuIcon,
} from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import ArtifactsSection from './ArtifactsSection';
import { downloadAllArtifacts } from './artifactUtils';
import DatasetsSection from './DatasetsSection';
import ModelsSection from './ModelsSection';
import ArtifactPreviewPane, { PreviewableItem } from './ArtifactPreviewPane';
import ProfilingReport from '../ProfilingReport';

interface JobArtifactsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string | null;
}

export default function JobArtifactsModal({
  open,
  onClose,
  jobId,
}: JobArtifactsModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const [modelsCount, setModelsCount] = useState<number | null>(null);
  const [datasetsCount, setDatasetsCount] = useState<number | null>(null);
  const [artifactsCount, setArtifactsCount] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<PreviewableItem | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const handleDownloadAll = async () => {
    if (!jobId) return;
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
        <Typography level="h2" sx={{ mb: 2, mr: 4 }}>
          Artifacts for Job {jobId}
        </Typography>
        <Box sx={{ display: 'flex', flex: 1, gap: 2, overflow: 'hidden' }}>
          {/* Left: scrollable sections */}
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
                      startDecorator={
                        !isDownloadingAll && <Download size={14} />
                      }
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
                {jobId && <ProfilingReport jobId={jobId} />}
              </section>
            </Stack>
          </Box>

          <Divider orientation="vertical" />

          {/* Right: always-visible preview pane */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <ArtifactPreviewPane
              item={previewItem}
              onClose={() => setPreviewItem(null)}
            />
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
