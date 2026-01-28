import { useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Table,
  Box,
  CircularProgress,
  IconButton,
  Sheet,
  Button,
  Divider,
  Stack,
} from '@mui/joy';
import { Eye, Download, X } from 'lucide-react';
import { useAPI, getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetchWithAuth } from 'renderer/lib/authContext';

interface ViewArtifactsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number | string;
}

interface Artifact {
  filename: string;
  date?: string;
  size?: number;
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

  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  let noArtifacts = false;

  // Cleanup blob URLs when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (previewData?.url && previewData.url.startsWith('blob:')) {
        URL.revokeObjectURL(previewData.url);
      }
    };
  }, [previewData]);

  if (!artifactsLoading && data?.artifacts?.length === 0) {
    noArtifacts = true;
  }

  const hasDate = !!data?.artifacts?.some(
    (artifact: Artifact) => artifact.date,
  );
  const hasSize = !!data?.artifacts?.some(
    (artifact: Artifact) => artifact.size,
  );

  const getFileExtension = (filename: string) => {
    return filename.toLowerCase().split('.').pop() || '';
  };

  const canPreview = (filename: string) => {
    const ext = getFileExtension(filename);
    const previewableExtensions = [
      'json',
      'txt',
      'log',
      // Images
      'png',
      'jpg',
      'jpeg',
      'gif',
      'bmp',
      'webp',
      'svg',
      // Video
      'mp4',
      'webm',
      'mov',
      // Audio
      'mp3',
      'wav',
      'ogg',
      'm4a',
      'flac',
    ];
    return previewableExtensions.includes(ext);
  };

  const handleViewArtifact = async (artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);

    const ext = getFileExtension(artifact.filename);

    try {
      if (ext === 'json') {
        // Fetch JSON data with authentication
        const url = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        const response = await fetchWithAuth(`${url}?task=view`);
        if (!response.ok) {
          throw new Error('Failed to load artifact');
        }
        const jsonData = await response.json();
        setPreviewData({ type: 'json', data: jsonData });
      } else if (['txt', 'log'].includes(ext)) {
        // Fetch text data with authentication
        const url = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        const response = await fetchWithAuth(`${url}?task=view`);
        if (!response.ok) {
          throw new Error('Failed to load artifact');
        }
        const textData = await response.text();
        setPreviewData({ type: 'text', data: textData });
      } else if (
        ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)
      ) {
        // Image preview - URLs will be authenticated by browser when fetching
        const imageUrl = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        // For images, we need to fetch as blob and create object URL to handle auth
        const response = await fetchWithAuth(`${imageUrl}?task=view`);
        if (!response.ok) {
          throw new Error('Failed to load image');
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPreviewData({ type: 'image', url: blobUrl });
      } else if (['mp4', 'webm', 'mov'].includes(ext)) {
        // Video preview - fetch as blob and create object URL
        const videoUrl = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        const response = await fetchWithAuth(`${videoUrl}?task=view`);
        if (!response.ok) {
          throw new Error('Failed to load video');
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPreviewData({ type: 'video', url: blobUrl });
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        // Audio preview - fetch as blob and create object URL
        const audioUrl = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        const response = await fetchWithAuth(`${audioUrl}?task=view`);
        if (!response.ok) {
          throw new Error('Failed to load audio');
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPreviewData({ type: 'audio', url: blobUrl });
      }
    } catch (error) {
      setPreviewError('Failed to load artifact preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadArtifact = async (artifact: Artifact) => {
    try {
      const downloadUrl = getAPIFullPath('jobs', ['getArtifact'], {
        experimentId: experimentInfo?.id,
        jobId: jobId.toString(),
        filename: artifact.filename,
      });

      // Fetch with authentication and trigger download
      const response = await fetchWithAuth(`${downloadUrl}?task=download`);
      if (!response.ok) {
        throw new Error('Failed to download artifact');
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Create a temporary link and click it to trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = artifact.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (error) {
      console.error('Download failed:', error);
      // Optionally show an error notification to the user
    }
  };

  const handleDownloadAllArtifacts = async () => {
    try {
      setIsDownloading(true);
      const downloadUrl = getAPIFullPath('jobs', ['downloadAllArtifacts'], {
        experimentId: experimentInfo?.id,
        jobId: jobId.toString(),
      });

      // Fetch with authentication and trigger download
      const response = await fetchWithAuth(`${downloadUrl}`);
      if (!response.ok) {
        throw new Error('Failed to download artifacts');
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Create a temporary link and click it to trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `artifacts_job_${jobId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (error) {
      console.error('Download failed:', error);
      // Optionally show an error notification to the user
    } finally {
      setIsDownloading(false);
    }
  };

  const closePreview = () => {
    // Cleanup blob URL if exists
    if (previewData?.url && previewData.url.startsWith('blob:')) {
      URL.revokeObjectURL(previewData.url);
    }
    setSelectedArtifact(null);
    setPreviewData(null);
    setPreviewError(null);
  };

  const renderPreview = () => {
    if (previewLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (previewError) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="danger">{previewError}</Typography>
        </Box>
      );
    }

    if (!previewData) {
      return null;
    }

    switch (previewData.type) {
      case 'json':
        return (
          <Box
            sx={{
              p: 2,
              maxHeight: 'calc(80vh - 200px)',
              overflow: 'auto',
              backgroundColor: 'background.level1',
              borderRadius: 'sm',
            }}
          >
            <pre
              style={{
                margin: 0,
                fontFamily: 'monospace',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(previewData.data, null, 2)}
            </pre>
          </Box>
        );
      case 'text':
        return (
          <Box
            sx={{
              p: 2,
              maxHeight: 'calc(80vh - 200px)',
              overflow: 'auto',
              backgroundColor: 'background.level1',
              borderRadius: 'sm',
            }}
          >
            <pre
              style={{
                margin: 0,
                fontFamily: 'monospace',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {previewData.data}
            </pre>
          </Box>
        );
      case 'image':
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              maxHeight: 'calc(80vh - 200px)',
              overflow: 'auto',
              p: 2,
            }}
          >
            <img
              src={previewData.url}
              alt={selectedArtifact?.filename}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </Box>
        );
      case 'video':
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              maxHeight: 'calc(80vh - 200px)',
              overflow: 'auto',
              p: 2,
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              controls
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
              }}
            >
              <source src={previewData.url} />
              Your browser does not support the video tag.
            </video>
          </Box>
        );
      case 'audio':
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              maxHeight: 'calc(80vh - 200px)',
              overflow: 'auto',
              p: 2,
            }}
          >
            <audio
              controls
              style={{
                width: '100%',
              }}
            >
              <source src={previewData.url} />
              Your browser does not support the audio element.
            </audio>
          </Box>
        );
      default:
        return null;
    }
  };

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
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 2, mr: 4 }}
        >
          <Typography id="artifacts-modal-title" level="h2">
            Artifacts for Job {jobId}
          </Typography>
          {!noArtifacts && !artifactsLoading && (
            <Button
              startDecorator={!isDownloading && <Download size={16} />}
              loading={isDownloading}
              onClick={handleDownloadAllArtifacts}
              variant="soft"
              color="primary"
            >
              Download All
            </Button>
          )}
        </Stack>

        {noArtifacts ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography level="body-lg" color="neutral">
              No artifacts found for this job.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden' }}>
            {/* Artifacts List */}
            <Box
              sx={{
                flex: selectedArtifact ? '0 0 400px' : 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <Typography level="body-md" sx={{ mt: 1, mb: 2 }}>
                This job has{' '}
                {data?.artifacts?.length || (
                  <CircularProgress
                    sx={{
                      '--CircularProgress-size': '18px',
                      '--CircularProgress-trackThickness': '4px',
                      '--CircularProgress-progressThickness': '2px',
                    }}
                  />
                )}{' '}
                artifact(s):
              </Typography>

              {artifactsLoading ? (
                <Typography level="body-md">Loading artifacts...</Typography>
              ) : (
                <Sheet
                  sx={{
                    overflow: 'auto',
                    borderRadius: 'sm',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Table stickyHeader>
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>#</th>
                        <th>Artifact</th>
                        {hasDate && <th>Date</th>}
                        {hasSize && <th style={{ width: '100px' }}>Size</th>}
                        <th style={{ width: '120px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.artifacts?.map(
                        (artifact: Artifact, index: number) => (
                          <tr key={`artifact-${artifact.filename}`}>
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
                            {hasDate && (
                              <td>
                                <Typography level="body-sm">
                                  {artifact.date
                                    ? new Date(artifact.date).toLocaleString()
                                    : '-'}
                                </Typography>
                              </td>
                            )}
                            {hasSize && (
                              <td>
                                <Typography level="body-sm">
                                  {artifact.size
                                    ? formatBytes(artifact.size)
                                    : '-'}
                                </Typography>
                              </td>
                            )}
                            <td>
                              <Stack direction="row" spacing={0.5}>
                                {canPreview(artifact.filename) && (
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="primary"
                                    onClick={() => handleViewArtifact(artifact)}
                                    title="View"
                                  >
                                    <Eye size={16} />
                                  </IconButton>
                                )}
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="neutral"
                                  onClick={() =>
                                    handleDownloadArtifact(artifact)
                                  }
                                  title="Download"
                                >
                                  <Download size={16} />
                                </IconButton>
                              </Stack>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </Table>
                </Sheet>
              )}
            </Box>

            {/* Preview Pane */}
            {selectedArtifact && (
              <>
                <Divider orientation="vertical" />
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                  >
                    <Typography level="title-md">
                      Preview: {selectedArtifact.filename}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="sm"
                        variant="outlined"
                        startDecorator={<Download size={16} />}
                        onClick={() => handleDownloadArtifact(selectedArtifact)}
                      >
                        Download
                      </Button>
                      <IconButton
                        size="sm"
                        variant="plain"
                        onClick={closePreview}
                      >
                        <X size={16} />
                      </IconButton>
                    </Stack>
                  </Stack>
                  <Sheet
                    sx={{
                      flex: 1,
                      overflow: 'auto',
                      borderRadius: 'sm',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    {renderPreview()}
                  </Sheet>
                </Box>
              </>
            )}
          </Box>
        )}
      </ModalDialog>
    </Modal>
  );
}
