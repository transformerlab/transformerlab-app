import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Table,
  Button,
  Box,
} from '@mui/joy';
import { DownloadIcon } from 'lucide-react';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

interface ViewModelsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number;
}

export default function ViewModelsModal({ open, onClose, jobId }: ViewModelsModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const { data, isLoading: modelsLoading } = useAPI(
    'jobs',
    ['getModels'],
    { jobId, experimentId: experimentInfo?.id },
  );

  const handleDownloadModel = (model: any) => {
    // TODO: Implement download functionality
    console.log('Downloading model:', model);
  };

  let noModels = false;

  if (!modelsLoading && data?.models?.length === 0) {
    noModels = true;
  }

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog sx={{ minWidth: '80%' }}>
        <ModalClose />

        {noModels ? (
          <Typography level="body-md" sx={{ textAlign: 'center', py: 4 }}>
            No models were saved in this job.
          </Typography>
        ) : (
          <>
            <Typography level="h4" component="h2">
              Models for Job {jobId}
            </Typography>

            {modelsLoading ? (
              <Typography level="body-md">Loading models...</Typography>
            ) : (
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Model Name</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.models?.map((model: any, index: number) => (
                      <tr key={index}>
                        <td>
                          <Typography level="title-sm">
                            {model.name}
                          </Typography>
                        </td>
                        <td>{new Date(model.date).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            size="sm"
                            variant="outlined"
                            onClick={() =>
                              handleDownloadModel(model)
                            }
                            startDecorator={<DownloadIcon />}
                          >
                            Download
                          </Button>
                        </td>
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
