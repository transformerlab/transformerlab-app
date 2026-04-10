import { useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Box,
  CircularProgress,
  IconButton,
  Sheet,
  Button,
  Divider,
  Stack,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
} from '@mui/joy';
import { Download, X } from 'lucide-react';
import { useAPI, getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { formatBytes } from 'renderer/lib/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import Model3DViewer from 'renderer/components/Shared/Model3DViewer';
import {
  canPreviewFile as canPreview,
  getFileExtension,
  downloadArtifact,
  downloadAllArtifacts,
} from './artifactUtils';

interface ArtifactsSectionProps {
  open?: boolean;
  onClose?: () => void;
  jobId: number | string | null;
  renderContentOnly?: boolean;
  onCountLoaded?: (count: number) => void;
  onPreviewItem?: (item: { filename: string; jobId: string }) => void;
  selectedFilename?: string | null;
}

interface Artifact {
  filename: string;
  date?: string;
  size?: number;
}

export default function ArtifactsSection({
  open = false,
  onClose = () => {},
  jobId,
  renderContentOnly = false,
  onCountLoaded,
  onPreviewItem,
  selectedFilename,
}: ArtifactsSectionProps) {
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

  useEffect(() => {
    if (!artifactsLoading && data?.artifacts) {
      onCountLoaded?.(data.artifacts.length);
    }
  }, [artifactsLoading, data]);

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

  const handleViewArtifact = async (artifact: Artifact) => {
    if (!jobId) return;
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
        // Image preview - use direct URL; cookies handle auth
        const imageUrl = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        setPreviewData({ type: 'image', url: `${imageUrl}?task=view` });
      } else if (['mp4', 'webm', 'mov'].includes(ext)) {
        // Video preview - use direct URL; cookies handle auth
        const videoUrl = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        setPreviewData({ type: 'video', url: `${videoUrl}?task=view` });
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        // Audio preview - use direct URL; cookies handle auth
        const audioUrl = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        setPreviewData({ type: 'audio', url: `${audioUrl}?task=view` });
      } else if (['glb', 'gltf'].includes(ext)) {
        // 3D model preview - use direct URL; cookies handle auth
        const modelUrl = getAPIFullPath('jobs', ['getArtifact'], {
          experimentId: experimentInfo?.id,
          jobId: jobId.toString(),
          filename: artifact.filename,
        });
        setPreviewData({
          type: 'model3d',
          url: `${modelUrl}?task=view`,
          filename: artifact.filename,
        });
      }
    } catch (error) {
      setPreviewError('Failed to load artifact preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadArtifact = async (artifact: Artifact) => {
    if (!jobId) return;
    try {
      await downloadArtifact(
        experimentInfo?.id,
        jobId.toString(),
        artifact.filename,
      );
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDownloadAllArtifacts = async () => {
    if (!jobId) return;
    try {
      setIsDownloading(true);
      await downloadAllArtifacts(experimentInfo?.id, jobId.toString());
    } catch (error) {
      console.error('Download failed:', error);
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
      case 'model3d':
        return (
          <Box
            sx={{
              height: 'calc(80vh - 200px)',
              overflow: 'hidden',
            }}
          >
            <Model3DViewer
              modelUrl={previewData.url}
              filename={previewData.filename}
            />
          </Box>
        );
      default:
        return null;
    }
  };

  const content = (
    <>
      {!renderContentOnly && (
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 2 }}
        >
          {!noArtifacts && !artifactsLoading && (
            <Button
              startDecorator={!isDownloading && <Download size={16} />}
              loading={isDownloading}
              onClick={handleDownloadAllArtifacts}
              variant="soft"
              color="primary"
              sx={{ ml: 'auto' }}
            >
              Download All
            </Button>
          )}
        </Stack>
      )}

      {noArtifacts ? null : (
        <Box sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden' }}>
          {/* Artifacts List */}
          <Box
            sx={{
              flex: !onPreviewItem && selectedArtifact ? '0 0 400px' : 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {artifactsLoading ? (
              <Typography level="body-md">Loading artifacts...</Typography>
            ) : (
              <List
                sx={{
                  overflow: 'auto',
                  p: 0,
                }}
              >
                {data?.artifacts?.map((artifact: Artifact) => (
                  <ListItem key={`artifact-${artifact.filename}`}>
                    <ListItemButton
                      selected={
                        selectedFilename
                          ? selectedFilename === artifact.filename
                          : selectedArtifact?.filename === artifact.filename
                      }
                      onClick={() =>
                        canPreview(artifact.filename)
                          ? onPreviewItem
                            ? onPreviewItem({
                                filename: artifact.filename,
                                jobId: String(jobId),
                              })
                            : handleViewArtifact(artifact)
                          : undefined
                      }
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <ListItemContent sx={{ flex: 1, minWidth: 0 }}>
                        <Typography level="title-sm" noWrap>
                          {artifact.filename}
                        </Typography>
                        <Stack direction="row" spacing={2}>
                          {hasDate && artifact.date && (
                            <Typography level="body-xs">
                              {new Date(artifact.date).toLocaleString()}
                            </Typography>
                          )}
                          {hasSize && artifact.size && (
                            <Typography level="body-xs">
                              {formatBytes(artifact.size)}
                            </Typography>
                          )}
                        </Stack>
                      </ListItemContent>
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="neutral"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadArtifact(artifact);
                        }}
                        title="Download"
                        sx={{ flexShrink: 0 }}
                      >
                        <Download size={16} />
                      </IconButton>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {!onPreviewItem && selectedArtifact && (
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
                  }}
                >
                  {renderPreview()}
                </Sheet>
              </Box>
            </>
          )}
        </Box>
      )}
    </>
  );

  if (renderContentOnly) {
    return content;
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
        <Typography id="artifacts-modal-title" level="h2" sx={{ mb: 2, mr: 4 }}>
          Artifacts for Job {jobId}
        </Typography>
        {content}
      </ModalDialog>
    </Modal>
  );
}
