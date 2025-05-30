import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  CircularProgress,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  Checkbox,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Alert,
  Stack,
} from '@mui/joy';
import {
  Trash2Icon,
  DeleteIcon,
  FileCheckIcon,
  CheckSquareIcon,
  SquareIcon,
  SquareMinusIcon,
  XIcon,
} from 'lucide-react';
import { getFullPath } from 'renderer/lib/transformerlab-api-sdk';
import HistoryCard from './HistoryCard';
import HistoryImageViewModal from './HistoryImageViewModal';

export type HistoryImage = {
  id: string;
  prompt: string;
  image_base64: string;
  timestamp: string;
  num_images?: number; // Add support for multiple images
  metadata: {
    prompt: string;
    num_inference_steps: number;
    guidance_scale: number;
    seed: number;
    model: string;
    adaptor: string;
    adaptor_scale?: number;
    upscale?: boolean;
    upscale_factor?: number;
    negative_prompt?: string;
    eta?: number;
    clip_skip?: number;
    guidance_rescale?: number;
    width?: number;
    height?: number;
    generation_time?: number;
    num_images?: number; // Add num_images to metadata as well
    // Image-to-image specific fields
    input_image_path?: string;
    strength?: number;
    is_img2img?: boolean;
  };
};

export type HistoryData = {
  images: HistoryImage[];
  total: number;
};

type HistoryProps = {};

const History: React.FC<HistoryProps> = () => {
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<HistoryImage | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [datasetModalOpen, setDatasetModalOpen] = useState(false);
  const [datasetName, setDatasetName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState('');

  // Load history
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(
        getFullPath('diffusion', ['getHistory'], { limit: 50, offset: 0 }),
      );
      const data = await response.json();

      // For each image, fetch the count of images available
      const enrichedImages = await Promise.all(
        data.images.map(async (image: HistoryImage) => {
          try {
            const countResponse = await fetch(
              getFullPath('diffusion', ['getImageCount'], {
                imageId: image.id,
              }),
            );
            const countData = await countResponse.json();
            return {
              ...image,
              num_images: countData.num_images || 1,
              metadata: {
                ...image.metadata,
                num_images: countData.num_images || 1,
              },
            };
          } catch (e) {
            // If count fetch fails, assume single image
            return {
              ...image,
              num_images: 1,
              metadata: {
                ...image.metadata,
                num_images: 1,
              },
            };
          }
        }),
      );

      setHistoryData({
        ...data,
        images: enrichedImages,
      });
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // View image in modal
  const viewImage = async (imageId: string) => {
    try {
      const response = await fetch(
        getFullPath('diffusion', ['getImageInfo'], { imageId }),
      );
      const data = await response.json();
      setSelectedImage(data);
      setImageModalOpen(true);
    } catch (e) {
      console.error('Failed to load image:', e);
    }
  };

  // Delete single image
  const deleteImage = async (imageId: string) => {
    try {
      await fetch(getFullPath('diffusion', ['deleteImage'], { imageId }), {
        method: 'DELETE',
      });
      await loadHistory(); // Reload history
      setDeleteConfirmOpen(false);
      setImageToDelete(null);
    } catch (e) {
      console.error('Failed to delete image:', e);
    }
  };

  // Delete selected images
  const deleteSelectedImages = async () => {
    try {
      // Delete all selected images
      await Promise.all(
        Array.from(selectedImages).map((imageId) =>
          fetch(getFullPath('diffusion', ['deleteImage'], { imageId }), {
            method: 'DELETE',
          }),
        ),
      );
      await loadHistory(); // Reload history
      setSelectedImages(new Set());
      setSelectionMode(false);
      setDeleteConfirmOpen(false);
    } catch (e) {
      console.error('Failed to delete selected images:', e);
    }
  };

  // Clear all history
  const clearAllHistory = async () => {
    if (
      !confirm(
        'Are you sure you want to clear all history? This action cannot be undone.',
      )
    ) {
      return;
    }
    try {
      await fetch(getFullPath('diffusion', ['clearHistory'], {}), {
        method: 'DELETE',
      });
      await loadHistory(); // Reload history
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  // Selection mode handlers
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedImages(new Set());
  };

  const toggleImageSelection = (imageId: string) => {
    const newSelection = new Set(selectedImages);
    if (newSelection.has(imageId)) {
      newSelection.delete(imageId);
    } else {
      newSelection.add(imageId);
    }
    setSelectedImages(newSelection);
  };

  const selectAllImages = () => {
    if (!historyData?.images) return;
    const allIds = new Set(historyData.images.map((img) => img.id));
    setSelectedImages(allIds);
  };

  const deselectAllImages = () => {
    setSelectedImages(new Set());
  };

  // Dataset creation
  const createDatasetFromSelection = async () => {
    if (selectedImages.size === 0) return;

    setDatasetLoading(true);
    setDatasetError('');

    try {
      const response = await fetch(
        getFullPath('diffusion', ['createDataset'], {}),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset_name: datasetName,
            image_ids: Array.from(selectedImages),
            description: datasetDescription,
            include_metadata: includeMetadata,
          }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        // Reset form and close modal
        setDatasetModalOpen(false);
        setDatasetName('');
        setDatasetDescription('');
        setSelectedImages(new Set());
        setSelectionMode(false);
        // Could show success message here
      } else {
        setDatasetError(data.detail || 'Failed to create dataset');
      }
    } catch (e) {
      setDatasetError('Failed to create dataset');
    } finally {
      setDatasetLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        padding: 2,
      }}
    >
      <Box
        id="history-header-with-selection-and-actions"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            onClick={toggleSelectionMode}
            variant={selectionMode ? 'soft' : 'outlined'}
            color={selectionMode ? 'warning' : 'neutral'}
            size="sm"
            startDecorator={
              selectionMode ? (
                <SquareMinusIcon size="16px" />
              ) : (
                <SquareIcon size="16px" />
              )
            }
          >
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>

          {selectionMode &&
            historyData?.images &&
            historyData.images.length > 0 && (
              <>
                <Button
                  onClick={selectAllImages}
                  variant="outlined"
                  size="sm"
                  disabled={selectedImages.size === historyData.images.length}
                >
                  Select All
                </Button>
                <Button
                  onClick={deselectAllImages}
                  variant="outlined"
                  size="sm"
                  disabled={selectedImages.size === 0}
                  startDecorator={<XIcon size="16px" />}
                >
                  Clear
                </Button>
                <Typography level="body-sm" sx={{ ml: 1 }}>
                  {selectedImages.size} selected
                </Typography>
              </>
            )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {selectionMode && selectedImages.size > 0 && (
            <>
              <Button
                onClick={() => setDatasetModalOpen(true)}
                color="success"
                variant="solid"
                size="sm"
                startDecorator={<FileCheckIcon size="16px" />}
              >
                Export to Dataset
              </Button>
              <Button
                onClick={() => setDeleteConfirmOpen(true)}
                color="danger"
                variant="solid"
                size="sm"
                startDecorator={<DeleteIcon size="16px" />}
              >
                Delete Selected
              </Button>
            </>
          )}
          <Button
            onClick={clearAllHistory}
            color="danger"
            variant="outlined"
            size="sm"
            startDecorator={<Trash2Icon size="16px" />}
            disabled={!historyData?.images?.length}
          >
            Delete All
          </Button>
        </Box>
      </Box>
      {historyLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {historyData &&
        !historyLoading &&
        (historyData.images && historyData.images.length > 0 ? (
          <Grid container spacing={2} sx={{ overflow: 'auto' }}>
            {historyData.images.map((item: any) => (
              <Grid key={item.id} xs={12} sm={6} md={4} lg={3}>
                <HistoryCard
                  item={item}
                  selectionMode={selectionMode}
                  selectedImages={selectedImages}
                  toggleImageSelection={toggleImageSelection}
                  viewImage={viewImage}
                  setImageToDelete={setImageToDelete}
                  setDeleteConfirmOpen={setDeleteConfirmOpen}
                />
              </Grid>
            ))}
          </Grid>
        ) : (
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography>No images generated yet</Typography>
          </Box>
        ))}

      {/* Image View Modal */}
      <HistoryImageViewModal
        selectedImage={selectedImage}
        setImageModalOpen={setImageModalOpen}
        imageModalOpen={imageModalOpen}
        setImageToDelete={setImageToDelete}
        setDeleteConfirmOpen={setDeleteConfirmOpen}
      />

      {/* Dataset Creation Modal */}
      <Modal open={datasetModalOpen} onClose={() => setDatasetModalOpen(false)}>
        <ModalDialog size="md">
          <ModalClose />
          <DialogTitle>Create Dataset from Selected Images</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <Typography level="body-sm">
                Creating dataset from {selectedImages.size} selected images.
              </Typography>

              {datasetError && (
                <Alert color="danger" variant="soft">
                  {datasetError}
                </Alert>
              )}

              <FormControl>
                <FormLabel>Dataset Name</FormLabel>
                <Input
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  placeholder="Enter dataset name"
                  required
                />
              </FormControl>

              <FormControl>
                <FormLabel>Description (optional)</FormLabel>
                <Textarea
                  value={datasetDescription}
                  onChange={(e) => setDatasetDescription(e.target.value)}
                  placeholder="Describe your dataset"
                  minRows={2}
                />
              </FormControl>

              <FormControl>
                <Checkbox
                  checked={includeMetadata}
                  onChange={(e) => setIncludeMetadata(e.target.checked)}
                  label="Include generation metadata (model, parameters, etc.)"
                />
              </FormControl>

              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  justifyContent: 'flex-end',
                  mt: 2,
                }}
              >
                <Button
                  variant="outlined"
                  color="neutral"
                  onClick={() => setDatasetModalOpen(false)}
                  disabled={datasetLoading}
                >
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onClick={createDatasetFromSelection}
                  loading={datasetLoading}
                  disabled={!datasetName.trim() || datasetLoading}
                >
                  Create Dataset
                </Button>
              </Box>
            </Stack>
          </DialogContent>
        </ModalDialog>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <ModalDialog size="sm">
          <ModalClose />
          <DialogTitle>Confirm Delete</DialogTitle>
          <DialogContent>
            <Typography>
              {imageToDelete
                ? 'Are you sure you want to delete this image? This action cannot be undone.'
                : `Are you sure you want to delete ${selectedImages.size} selected images? This action cannot be undone.`}
            </Typography>
            <Box
              sx={{
                mt: 2,
                display: 'flex',
                gap: 1,
                justifyContent: 'flex-end',
              }}
            >
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                onClick={() =>
                  imageToDelete
                    ? deleteImage(imageToDelete)
                    : deleteSelectedImages()
                }
              >
                Delete
              </Button>
            </Box>
          </DialogContent>
        </ModalDialog>
      </Modal>
    </Box>
  );
};

export default History;
