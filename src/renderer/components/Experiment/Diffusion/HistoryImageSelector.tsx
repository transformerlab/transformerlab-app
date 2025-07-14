import React, { useState } from 'react';
import {
  Box,
  Button,
  Grid,
  CircularProgress,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  Typography,
  IconButton,
  Stack,
  Card,
  CardOverflow,
  AspectRatio,
} from '@mui/joy';
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from 'lucide-react';
import { getAPIFullPath, useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { HistoryImage } from './types';

interface HistoryImageSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelectImage: (imageBase64: string) => void;
}

const HistoryImageSelector: React.FC<HistoryImageSelectorProps> = ({
  open,
  onClose,
  onSelectImage,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const pageSize = 12;
  const offset = (currentPage - 1) * pageSize;

  const { data: historyData, isLoading: historyLoading } = useAPI(
    'diffusion',
    ['getHistory'],
    { limit: pageSize, offset },
  );

  // Reset selection when changing pages
  React.useEffect(() => {
    setSelectedImageId(null);
    setSelectedImageIndex(0);
  }, [currentPage]);

  const handleImageSelect = (imageId: string, imageIndex: number = 0) => {
    setSelectedImageId(imageId);
    setSelectedImageIndex(imageIndex);
  };

  const handleConfirmSelection = async () => {
    if (!selectedImageId) return;

    try {
      // Fetch the image as base64
      const response = await fetch(
        getAPIFullPath('diffusion', ['getImage'], {
          imageId: selectedImageId,
          index: selectedImageIndex,
        }),
      );

      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      const blob = await response.blob();
      const reader = new FileReader();

      reader.onload = () => {
        const base64String = reader.result as string;
        // Remove the data:image/... prefix to get just the base64 string
        const base64Data = base64String.split(',')[1];
        onSelectImage(base64Data);
        onClose();
      };

      reader.readAsDataURL(blob);
    } catch (error) {
      // Error handling for image fetch
    }
  };

  const totalPages = historyData ? Math.ceil(historyData.total / pageSize) : 1;

  const renderImageCard = (item: HistoryImage) => {
    const imageCount = item.num_images || item.metadata?.num_images || 1;
    const isSelected = selectedImageId === item.id;
    const displayIndex = isSelected ? selectedImageIndex : 0;

    return (
      <Card
        key={item.id}
        variant={isSelected ? 'solid' : 'outlined'}
        sx={{
          cursor: 'pointer',
          position: 'relative',
          '&:hover': {
            boxShadow: 'md',
          },
        }}
      >
        <CardOverflow>
          <AspectRatio ratio="1">
            <img
              src={getAPIFullPath('diffusion', ['getImage'], {
                imageId: item.id,
                index: displayIndex,
              })}
              alt={item.prompt}
              style={{ objectFit: 'cover' }}
              onClick={() => handleImageSelect(item.id, 0)}
            />
          </AspectRatio>
        </CardOverflow>

        {/* Show multiple images indicator */}
        {imageCount > 1 && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'var(--joy-palette-primary-500)',
              color: 'var(--joy-palette-neutral-50)',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: '0.75rem',
            }}
          >
            {imageCount} images
          </Box>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              backgroundColor: 'var(--joy-palette-primary-500)',
              color: 'var(--joy-palette-neutral-50)',
              borderRadius: '50%',
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckIcon size={14} />
          </Box>
        )}

        <Box p={1}>
          <Typography
            level="body-sm"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: isSelected
                ? 'var(--joy-palette-primary-100)'
                : 'var(--joy-palette-neutral-700)',
            }}
          >
            {item.prompt}
          </Typography>

          {/* Image index selector for multi-image items */}
          {imageCount > 1 && isSelected && (
            <Stack direction="row" spacing={1} mt={1} alignItems="center">
              <IconButton
                size="sm"
                variant="outlined"
                disabled={selectedImageIndex === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImageIndex(Math.max(0, selectedImageIndex - 1));
                }}
              >
                <ChevronLeftIcon size={14} />
              </IconButton>

              <Typography
                level="body-xs"
                sx={{
                  color: isSelected
                    ? 'var(--joy-palette-primary-100)'
                    : 'var(--joy-palette-neutral-700)',
                }}
              >
                {selectedImageIndex + 1} / {imageCount}
              </Typography>

              <IconButton
                size="sm"
                variant="outlined"
                disabled={selectedImageIndex === imageCount - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImageIndex(
                    Math.min(imageCount - 1, selectedImageIndex + 1),
                  );
                }}
              >
                <ChevronRightIcon size={14} />
              </IconButton>
            </Stack>
          )}
        </Box>
      </Card>
    );
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        size="lg"
        sx={{
          width: '80vw',
          height: '80vh',
          maxWidth: '1200px',
          maxHeight: '800px',
          minWidth: '600px',
          minHeight: '500px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <DialogTitle>Select Image from History</DialogTitle>

        <DialogContent
          sx={{
            overflow: 'auto',
            p: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {historyLoading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : !historyData?.images?.length ? (
            <Box p={4} textAlign="center">
              <Typography level="body-lg" color="neutral">
                No images found in history
              </Typography>
            </Box>
          ) : (
            <Box
              p={2}
              sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            >
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <Grid container spacing={2}>
                  {historyData.images.map((item: HistoryImage) => (
                    <Grid key={item.id} xs={12} sm={6} md={4} lg={3}>
                      {renderImageCard(item)}
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* Pagination */}
              {totalPages > 1 && (
                <Stack
                  direction="row"
                  spacing={2}
                  justifyContent="center"
                  alignItems="center"
                  mt={3}
                  sx={{ flexShrink: 0 }}
                >
                  <IconButton
                    variant="outlined"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    <ChevronLeftIcon />
                  </IconButton>

                  <Typography level="body-sm">
                    Page {currentPage} of {totalPages}
                  </Typography>

                  <IconButton
                    variant="outlined"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                </Stack>
              )}
            </Box>
          )}
        </DialogContent>

        <Stack direction="row" spacing={2} p={2} justifyContent="flex-end">
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirmSelection} disabled={!selectedImageId}>
            Select Image
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
};

export default HistoryImageSelector;
