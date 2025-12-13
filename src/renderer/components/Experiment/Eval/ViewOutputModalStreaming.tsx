import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

import {
  Box,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
  Button,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import OutputTerminal from 'renderer/components/OutputTerminal';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

interface ViewOutputModalStreamingProps {
  jobId: number;
  setJobId: (id: number) => void;
  fileName?: string | null;
  setFileName: (value: string) => void;
}

export default function ViewOutputModalStreaming({
  jobId,
  setJobId,
  fileName,
  setFileName,
}: ViewOutputModalStreamingProps) {
  const { experimentInfo } = useExperimentInfo();
  if (!experimentInfo) return null;
  const logEndpoint =
    fileName !== ''
      ? chatAPI.Endpoints.Experiment.StreamDetailedJSONReportFromJob(
          experimentInfo.id,
          jobId,
          fileName,
        )
      : chatAPI.Endpoints.Experiment.StreamOutputFromJob(
          experimentInfo.id,
          jobId,
        );
  const titleSentence =
    fileName !== '' ? 'Detailed Report for Job' : 'Output from Job';

  const handleDownload = async () => {
    if (!experimentInfo) return;
    const response = await chatAPI.authenticatedFetch(
      chatAPI.Endpoints.Experiment.GetAdditionalDetails(
        experimentInfo.id,
        jobId,
        'download',
      ),
    );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${jobId}.json`; // Adjust extension if necessary
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={jobId != -1}
      onClose={() => {
        setJobId(-1);
        setFileName('');
      }}
    >
      <ModalDialog sx={{ width: '90vw', height: '90vh', pt: 4 }}>
        <ModalClose />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography level="h4" mb={2}>
            {titleSentence} {jobId}
          </Typography>
          {fileName !== '' && (
            <Button
              onClick={handleDownload}
              variant="outlined"
              sx={{ mt: 1.5 }}
            >
              Download Report
            </Button>
          )}
        </Box>
        <Box
          sx={{
            height: '100%',
            overflow: 'hidden',
            border: '10px solid #444',
            padding: '0rem 0 0 1rem',
            backgroundColor: '#000',
            width: '100%',
          }}
        >
          <OutputTerminal logEndpoint={logEndpoint} lineAnimationDelay={5} />
        </Box>
      </ModalDialog>
    </Modal>
  );
}
