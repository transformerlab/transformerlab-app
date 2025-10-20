import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Table,
  Box,
} from '@mui/joy';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

interface ViewArtifactsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number | string;
}

export default function ViewArtifactsModal({
  open,
  onClose,
  jobId,
}: ViewArtifactsModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const { data, isLoading: artifactsLoading } = useAPI(
    'jobs',
    ['getArtifacts'],
    { jobId, experimentId: experimentInfo?.id },
  );

  let noArtifacts = false;

  if (!artifactsLoading && data?.artifacts?.length === 0) {
    noArtifacts = true;
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: 800,
          width: '90vw',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <Typography id="artifacts-modal-title" level="h2">
          Artifacts for Job {jobId}
        </Typography>

        {noArtifacts ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography level="body-lg" color="neutral">
              No artifacts found for this job.
            </Typography>
          </Box>
        ) : (
          <>
            <Typography level="body-md" sx={{ mt: 1, mb: 2 }}>
              This job has {data?.artifacts?.length || 0} artifact(s):
            </Typography>

            {artifactsLoading ? (
              <Typography level="body-md">Loading artifacts...</Typography>
            ) : (
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>#</th>
                      <th>Artifact</th>
                      <th>Date</th>
                      <th style={{ width: '100px' }}>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.artifacts?.map((artifact: any, index: number) => (
                      <tr key={`artifact-${artifact.filename}-${index}`}>
                        <td>
                          <Typography level="body-sm">
                            {(data?.artifacts?.length || 0) - index}.
                          </Typography>
                        </td>
                        <td>
                          <Typography level="title-sm">
                            {artifact.filename}
                          </Typography>
                        </td>
                        <td>{new Date(artifact.date).toLocaleString()}</td>
                        <td>{formatBytes(artifact.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Box>
            )}
          </>
        )}
      </ModalDialog>
    </Modal>
  );
}
