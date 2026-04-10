import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Sheet,
  Stack,
  Button,
  IconButton,
} from '@mui/joy';
import { Download, X } from 'lucide-react';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import Model3DViewer from 'renderer/components/Shared/Model3DViewer';
import { getFileExtension, downloadArtifact } from './artifactUtils';

export { canPreviewFile } from './artifactUtils';

export interface PreviewableItem {
  filename: string;
  jobId: string;
}

interface ArtifactPreviewPaneProps {
  item: PreviewableItem | null;
  onClose: () => void;
}

export default function ArtifactPreviewPane({
  item,
  onClose,
}: ArtifactPreviewPaneProps) {
  const { experimentInfo } = useExperimentInfo();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Cleanup blob URLs when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (previewData?.url && previewData.url.startsWith('blob:')) {
        URL.revokeObjectURL(previewData.url);
      }
    };
  }, [previewData]);

  const loadIdRef = useRef(0);

  // Load preview when item changes
  useEffect(() => {
    if (!item) {
      setPreviewData(null);
      setPreviewError(null);
      return;
    }
    const id = ++loadIdRef.current;
    loadPreview(item, id);
  }, [item?.filename, item?.jobId]);

  const loadPreview = async (previewItem: PreviewableItem, id: number) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);

    const ext = getFileExtension(previewItem.filename);
    const artifactUrl = getAPIFullPath('jobs', ['getArtifact'], {
      experimentId: experimentInfo?.id,
      jobId: previewItem.jobId,
      filename: previewItem.filename,
    });

    try {
      let data: any = null;
      if (ext === 'json') {
        const response = await fetchWithAuth(`${artifactUrl}?task=view`);
        if (!response.ok) throw new Error('Failed to load artifact');
        data = { type: 'json', data: await response.json() };
      } else if (['txt', 'log'].includes(ext)) {
        const response = await fetchWithAuth(`${artifactUrl}?task=view`);
        if (!response.ok) throw new Error('Failed to load artifact');
        data = { type: 'text', data: await response.text() };
      } else if (
        ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)
      ) {
        data = { type: 'image', url: `${artifactUrl}?task=view` };
      } else if (['mp4', 'webm', 'mov'].includes(ext)) {
        data = { type: 'video', url: `${artifactUrl}?task=view` };
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        data = { type: 'audio', url: `${artifactUrl}?task=view` };
      } else if (['glb', 'gltf'].includes(ext)) {
        data = {
          type: 'model3d',
          url: `${artifactUrl}?task=view`,
          filename: previewItem.filename,
        };
      }

      if (id !== loadIdRef.current) return;
      setPreviewData(data);
    } catch {
      if (id !== loadIdRef.current) return;
      setPreviewError('Failed to load artifact preview');
    } finally {
      if (id === loadIdRef.current) setPreviewLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!item) return;
    try {
      await downloadArtifact(experimentInfo?.id, item.jobId, item.filename);
    } catch (error) {
      console.error('Download failed:', error);
    }
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

    const preStyle = {
      margin: 0,
      fontFamily: 'monospace',
      fontSize: '12px',
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
    };

    switch (previewData.type) {
      case 'json':
        return (
          <Box
            sx={{
              p: 2,
              overflow: 'auto',
              flex: 1,
              backgroundColor: 'background.level1',
              borderRadius: 'sm',
            }}
          >
            <pre style={preStyle}>
              {JSON.stringify(previewData.data, null, 2)}
            </pre>
          </Box>
        );
      case 'text':
        return (
          <Box
            sx={{
              p: 2,
              overflow: 'auto',
              flex: 1,
              backgroundColor: 'background.level1',
              borderRadius: 'sm',
            }}
          >
            <pre style={preStyle}>{previewData.data}</pre>
          </Box>
        );
      case 'image':
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'auto',
              flex: 1,
              p: 2,
            }}
          >
            <img
              src={previewData.url}
              alt={item?.filename}
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
              overflow: 'auto',
              flex: 1,
              p: 2,
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video controls style={{ maxWidth: '100%', maxHeight: '100%' }}>
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
              overflow: 'auto',
              flex: 1,
              p: 2,
            }}
          >
            <audio controls style={{ width: '100%' }}>
              <source src={previewData.url} />
              Your browser does not support the audio element.
            </audio>
          </Box>
        );
      case 'model3d':
        return (
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {item ? (
        <>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 1, flexShrink: 0 }}
          >
            <Typography level="title-md" noWrap sx={{ flex: 1 }}>
              {item.filename}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button
                size="sm"
                variant="outlined"
                startDecorator={<Download size={16} />}
                onClick={handleDownload}
              >
                Download
              </Button>
              <IconButton size="sm" variant="plain" onClick={onClose}>
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
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {renderPreview()}
          </Sheet>
        </>
      ) : (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <Typography level="body-md" color="neutral">
            Select an artifact to preview
          </Typography>
        </Box>
      )}
    </Box>
  );
}
