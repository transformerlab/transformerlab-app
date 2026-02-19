import React, { useEffect, useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  ModalClose,
  ModalDialog,
  Button,
  Stack,
  CircularProgress,
  Alert,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

const ViewGpuProfileModal = ({
  open,
  onClose,
  jobId,
}: {
  open: boolean;
  onClose: () => void;
  jobId: number | string;
}) => {
  const { experimentInfo } = useExperimentInfo();
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch job data to get profiling metadata
  const {
    data: jobData,
    isError: jobError,
    isLoading: isLoadingJob,
  } = useSWR(
    open && jobId && experimentInfo?.id
      ? chatAPI.Endpoints.Jobs.Get(experimentInfo.id, String(jobId))
      : null,
    fetcher,
  );

  // Extract profiling metadata from job data
  const profileFile = jobData?.job_data?.gpu_profile_file;
  const profileVendor = jobData?.job_data?.gpu_profile_vendor || 'unknown';
  const profileFormat = jobData?.job_data?.gpu_profile_format || '';

  const handleDownload = async () => {
    if (!experimentInfo?.id || !jobId) return;

    setIsDownloading(true);
    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Experiment.GetGpuProfile(
          experimentInfo.id,
          String(jobId),
          'download',
        ),
      );
      if (!response.ok) {
        throw new Error('Failed to download GPU profile');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Extract filename from profile file path or use default
      const filename = profileFile?.split('/').pop() || `gpu_profile_${jobId}${profileFormat}`;
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading GPU profile:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const getVendorDisplayName = (vendor: string) => {
    if (vendor === 'nvidia') return 'NVIDIA';
    if (vendor === 'amd') return 'AMD';
    return 'Unknown';
  };

  const getFormatDescription = (format: string, vendor: string) => {
    if (format === '.nsys-rep') {
      return 'NVIDIA Nsight Systems report file. Open with NVIDIA Nsight Systems GUI or use `nsys export` for text/JSON output.';
    }
    if (format === '.rocpd') {
      return 'ROCm profiling data file. View with ROCm profiling tools.';
    }
    if (format === '.csv') {
      return 'CSV profiling data. Can be opened in spreadsheet applications.';
    }
    if (format === '.json') {
      return 'JSON profiling data. Can be viewed in any text editor or JSON viewer.';
    }
    return 'GPU profiling report file.';
  };

  const error = jobError ? 'Failed to load GPU profiling information' : null;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '80vw', maxWidth: '800px' }}>
        <ModalClose />
        <Typography level="h4" mb={2}>
          GPU Profiling Report - Job {jobId}
        </Typography>

        {isLoadingJob ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert color="danger">{error}</Alert>
        ) : !profileFile ? (
          <Alert color="warning">
            No GPU profiling report found for this job.
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Typography level="body-md" fontWeight="bold" mb={1}>
                Profiling Information
              </Typography>
              <Stack spacing={1}>
                <Typography level="body-sm">
                  <strong>Vendor:</strong> {getVendorDisplayName(profileVendor)}
                </Typography>
                <Typography level="body-sm">
                  <strong>Format:</strong> {profileFormat || 'Unknown'}
                </Typography>
                <Typography level="body-sm">
                  <strong>File:</strong> {profileFile.split('/').pop()}
                </Typography>
              </Stack>
            </Box>

            <Box>
              <Typography level="body-md" mb={1}>
                {getFormatDescription(profileFormat, profileVendor)}
              </Typography>
              {profileFormat === '.nsys-rep' && (
                <Alert color="info" sx={{ mt: 1 }}>
                  To view this report, download it and open it with NVIDIA Nsight Systems.
                  If you don't have it installed, download it from{' '}
                  <a
                    href="https://developer.nvidia.com/nsight-systems"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    NVIDIA Developer
                  </a>
                  .
                </Alert>
              )}
            </Box>

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" onClick={onClose}>
                Close
              </Button>
              <Button
                onClick={handleDownload}
                loading={isDownloading}
                variant="solid"
                color="primary"
              >
                Download Report
              </Button>
            </Stack>
          </Stack>
        )}
      </ModalDialog>
    </Modal>
  );
};

export default ViewGpuProfileModal;
