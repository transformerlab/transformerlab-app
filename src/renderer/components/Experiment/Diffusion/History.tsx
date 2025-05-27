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
  DownloadIcon,
  DeleteIcon,
  FileCheckIcon,
  CheckSquareIcon,
  SquareIcon,
} from 'lucide-react';
import { Endpoints } from 'renderer/lib/api-client/endpoints';
import HistoryCard from './HistoryCard';

export type HistoryImage = {
  id: string;
  prompt: string;
  image_base64: string;
  timestamp: string;
  metadata: {
    prompt: string;
    num_inference_steps: number;
    guidance_scale: number;
    seed: number;
    model: string;
    adaptor: string;
    upscale?: boolean;
    upscale_factor?: number;
    negative_prompt?: string;
    eta?: number;
    clip_skip?: number;
    guidance_rescale?: number;
    width?: number;
    height?: number;
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
      const response = await fetch(Endpoints.Diffusion.GetHistory());
      const data = await response.json();
      setHistoryData(data);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // View image in modal
  const viewImage = async (imageId: string) => {
    try {
      const response = await fetch(Endpoints.Diffusion.GetImageById(imageId));
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
      await fetch(Endpoints.Diffusion.DeleteImage(imageId), {
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
          fetch(Endpoints.Diffusion.DeleteImage(imageId), {
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
      await fetch(Endpoints.Diffusion.ClearHistory(), {
        method: 'DELETE',
      });
      await loadHistory(); // Reload history
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  // Download image from history
  const downloadHistoryImage = (imageData: HistoryImage) => {
    if (!imageData.image_base64) return;
    const byteCharacters = atob(imageData.image_base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diffusion_${imageData.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
      const response = await fetch(Endpoints.Diffusion.CreateDataset(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_name: datasetName,
          image_ids: Array.from(selectedImages),
          description: datasetDescription,
          include_metadata: includeMetadata,
        }),
      });

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
        overflow: 'auto',
        padding: 2,
      }}
    >
      <Box
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
            variant={selectionMode ? 'solid' : 'outlined'}
            color={selectionMode ? 'primary' : 'neutral'}
            size="sm"
            startDecorator={
              selectionMode ? (
                <CheckSquareIcon size="16px" />
              ) : (
                <SquareIcon size="16px" />
              )
            }
          >
            {selectionMode ? 'Exit Select' : 'Select'}
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
            Delete Entire History
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
          <Grid container spacing={2}>
            {historyData.images.map((item: any) => (
              <Grid key={item.id} xs={12} sm={6} md={4} lg={3}>
                <HistoryCard
                  item={item}
                  selectionMode={selectionMode}
                  selectedImages={selectedImages}
                  toggleImageSelection={toggleImageSelection}
                  viewImage={viewImage}
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
      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
        <ModalDialog
          size="lg"
          sx={{
            p: 3,
            maxWidth: '95vw',
            maxHeight: '95vh',
            border: '2px solid var(--joy-palette-neutral-300)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          <ModalClose />
          {selectedImage && (
            <>
              <DialogTitle sx={{ pb: 2 }}>Generated Image</DialogTitle>
              <DialogContent sx={{ p: 0 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Box
                    sx={{
                      border: '1px solid var(--joy-palette-neutral-200)',
                      borderRadius: '8px',
                      p: 1,
                      mb: 3,
                      backgroundColor: 'var(--joy-palette-background-body)',
                    }}
                  >
                    <img
                      src={`data:image/png;base64,${selectedImage.image_base64}`}
                      alt="Generated"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '65vh',
                        objectFit: 'contain',
                        borderRadius: '6px',
                        display: 'block',
                        margin: '0 auto',
                      }}
                    />
                  </Box>
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography level="title-md" sx={{ mb: 1 }}>
                      Prompt:
                    </Typography>
                    <Typography
                      sx={{
                        mb: 2,
                        p: 2,
                        backgroundColor: 'var(--joy-palette-background-level1)',
                        borderRadius: '6px',
                      }}
                    >
                      {selectedImage.metadata.prompt}
                    </Typography>
                    <Typography level="title-sm" sx={{ mb: 1 }}>
                      Model Info:
                    </Typography>
                    <Typography
                      level="body-sm"
                      sx={{
                        mb: 3,
                        p: 2,
                        backgroundColor: 'var(--joy-palette-background-level1)',
                        borderRadius: '6px',
                      }}
                    >
                      <strong>Model:</strong> {selectedImage.metadata.model}
                      {selectedImage.metadata.adaptor && (
                        <>
                          <br />
                          <strong>Adaptor:</strong>{' '}
                          {selectedImage.metadata.adaptor}
                        </>
                      )}
                    </Typography>

                    <Typography level="title-sm" sx={{ mb: 1 }}>
                      Parameters:
                    </Typography>
                    <Typography
                      level="body-sm"
                      sx={{
                        mb: 3,
                        p: 2,
                        backgroundColor: 'var(--joy-palette-background-level1)',
                        borderRadius: '6px',
                      }}
                    >
                      <strong>Steps:</strong>{' '}
                      {selectedImage.metadata.num_inference_steps} <br />
                      <strong>Guidance:</strong>{' '}
                      {selectedImage.metadata.guidance_scale} <br />
                      <strong>Seed:</strong> {selectedImage.metadata.seed}
                      {selectedImage.metadata.upscale && (
                        <>
                          <br />
                          <strong>Upscale:</strong>{' '}
                          {selectedImage.metadata.upscale_factor}x
                        </>
                      )}
                      {selectedImage.metadata.negative_prompt && (
                        <>
                          <br />
                          <strong>Negative Prompt:</strong>{' '}
                          {selectedImage.metadata.negative_prompt}
                        </>
                      )}
                      {selectedImage.metadata.eta !== undefined &&
                        selectedImage.metadata.eta !== null && (
                          <>
                            <br />
                            <strong>ETA:</strong> {selectedImage.metadata.eta}
                          </>
                        )}
                      {selectedImage.metadata.clip_skip !== undefined &&
                        selectedImage.metadata.clip_skip !== null && (
                          <>
                            <br />
                            <strong>CLIP Skip:</strong>{' '}
                            {selectedImage.metadata.clip_skip}
                          </>
                        )}
                      {selectedImage.metadata.guidance_rescale !== undefined &&
                        selectedImage.metadata.guidance_rescale !== null && (
                          <>
                            <br />
                            <strong>Guidance Rescale:</strong>{' '}
                            {selectedImage.metadata.guidance_rescale}
                          </>
                        )}
                      {selectedImage.metadata.width !== undefined &&
                        selectedImage.metadata.width !== null && (
                          <>
                            <br />
                            <strong>Width:</strong>{' '}
                            {selectedImage.metadata.width}
                          </>
                        )}
                      {selectedImage.metadata.height !== undefined &&
                        selectedImage.metadata.height !== null && (
                          <>
                            <br />
                            <strong>Height:</strong>{' '}
                            {selectedImage.metadata.height}
                          </>
                        )}
                    </Typography>

                    <Box
                      sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}
                    >
                      <Button
                        onClick={() => downloadHistoryImage(selectedImage)}
                        startDecorator={<DownloadIcon size="16px" />}
                        variant="solid"
                        color="primary"
                      >
                        Download
                      </Button>
                      <Button
                        color="danger"
                        variant="outlined"
                        onClick={() => {
                          setImageToDelete(selectedImage.id);
                          setDeleteConfirmOpen(true);
                          setImageModalOpen(false);
                        }}
                        startDecorator={<DeleteIcon size="16px" />}
                      >
                        Delete
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </DialogContent>
            </>
          )}
        </ModalDialog>
      </Modal>

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
