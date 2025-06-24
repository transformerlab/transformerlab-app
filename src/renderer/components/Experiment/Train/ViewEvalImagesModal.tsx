import React, { useEffect, useState } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Sheet,
  LinearProgress,
  Grid,
  Card,
  CardOverflow,
  AspectRatio,
  Chip,
  Stack,
} from '@mui/joy';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ViewEvalImagesModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string | number;
}

interface EvalImage {
  filename: string;
  path: string;
  size: number;
  modified: number;
}

interface EvalImagesResponse {
  images: EvalImage[];
}

export default function ViewEvalImagesModal({
  open,
  onClose,
  jobId,
}: ViewEvalImagesModalProps) {
  const [imageLoadingStates, setImageLoadingStates] = useState<{
    [key: string]: boolean;
  }>({});

  const {
    data: imagesData,
    error,
    isLoading,
  } = useSWR<EvalImagesResponse>(
    open && jobId && jobId !== -1
      ? chatAPI.Endpoints.Jobs.GetEvalImages(jobId.toString())
      : null,
    fetcher,
    {
      refreshInterval: 5000, // Refresh every 5 seconds in case new images are generated
    },
  );

  // Reset loading states when modal opens
  useEffect(() => {
    if (open) {
      setImageLoadingStates({});
    }
  }, [open]);

  const handleImageLoad = (filename: string) => {
    setImageLoadingStates((prev) => ({
      ...prev,
      [filename]: false,
    }));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Group images by epoch if the filename contains epoch information
  const groupImagesByEpoch = (images: EvalImage[]) => {
    const grouped: { [key: string]: EvalImage[] } = {};

    images.forEach((image) => {
      // Try to extract epoch information from filename
      const epochMatch = image.filename.match(/epoch[_-]?(\d+)/i);
      const stepMatch = image.filename.match(/step[_-]?(\d+)/i);

      let groupKey = 'Other';
      if (epochMatch) {
        groupKey = `Epoch ${epochMatch[1]}`;
      } else if (stepMatch) {
        groupKey = `Step ${stepMatch[1]}`;
      }

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(image);
    });

    // Sort groups and images within groups
    const sortedGroups: { [key: string]: EvalImage[] } = {};
    Object.keys(grouped)
      .sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;

        const aNum = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const bNum = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return aNum - bNum;
      })
      .forEach((key) => {
        sortedGroups[key] = grouped[key].sort((a, b) =>
          a.filename.localeCompare(b.filename),
        );
      });

    return sortedGroups;
  };

  const images = imagesData?.images || [];
  const groupedImages = groupImagesByEpoch(images);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        size="lg"
        sx={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          width: '1200px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          Evaluation Images - Job {jobId}
        </Typography>

        {isLoading && (
          <Box sx={{ mb: 2 }}>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              Loading images...
            </Typography>
            <LinearProgress />
          </Box>
        )}

        {error && (
          <Typography level="body-sm" color="danger" sx={{ mb: 2 }}>
            Error loading images: {error.message}
          </Typography>
        )}

        {!isLoading && !error && images.length === 0 && (
          <Typography level="body-sm" sx={{ textAlign: 'center', py: 4 }}>
            No evaluation images found for this job.
          </Typography>
        )}

        {images.length > 0 && (
          <Sheet
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 2,
              borderRadius: 'sm',
            }}
          >
            <Typography level="body-sm" sx={{ mb: 2 }}>
              Found {images.length} evaluation image
              {images.length !== 1 ? 's' : ''}
            </Typography>

            {Object.entries(groupedImages).map(([groupName, groupImages]) => (
              <Box key={groupName} sx={{ mb: 4 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{ mb: 2 }}
                >
                  <Typography level="title-md">{groupName}</Typography>
                  <Chip size="sm" variant="soft">
                    {groupImages.length} image
                    {groupImages.length !== 1 ? 's' : ''}
                  </Chip>
                </Stack>

                <Grid container spacing={2}>
                  {groupImages.map((image) => (
                    <Grid xs={12} sm={6} md={4} lg={3} key={image.filename}>
                      <Card variant="outlined">
                        <CardOverflow>
                          <AspectRatio ratio="1">
                            <Box sx={{ position: 'relative' }}>
                              {imageLoadingStates[image.filename] && (
                                <Box
                                  sx={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 1,
                                  }}
                                >
                                  <LinearProgress sx={{ width: '100px' }} />
                                </Box>
                              )}
                              <img
                                src={
                                  chatAPI.API_URL() + image.path.substring(1)
                                } // Remove leading slash
                                alt={image.filename}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'contain',
                                  cursor: 'pointer',
                                }}
                                onLoad={() => handleImageLoad(image.filename)}
                                onError={() => handleImageLoad(image.filename)}
                                onClick={() => {
                                  // Open image in new tab for full view
                                  window.open(
                                    chatAPI.API_URL() + image.path.substring(1),
                                    '_blank',
                                  );
                                }}
                              />
                            </Box>
                          </AspectRatio>
                        </CardOverflow>
                        <Box sx={{ p: 1 }}>
                          <Typography
                            level="body-sm"
                            sx={{
                              fontWeight: 'bold',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={image.filename}
                          >
                            {image.filename}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: 'text.tertiary' }}
                          >
                            {formatFileSize(image.size)}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: 'text.tertiary' }}
                          >
                            {formatDate(image.modified)}
                          </Typography>
                        </Box>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))}
          </Sheet>
        )}
      </ModalDialog>
    </Modal>
  );
}
