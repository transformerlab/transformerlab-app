import React, { useState } from 'react';
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
  IconButton,
  iconButtonClasses,
} from '@mui/joy';
import {
  Trash2Icon,
  DeleteIcon,
  FileCheckIcon,
  SquareIcon,
  SquareMinusIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { getAPIFullPath, useAPI } from 'renderer/lib/transformerlab-api-sdk';
import HistoryCard from './HistoryCard';
import HistoryImageViewModal from './HistoryImageViewModal';
import { HistoryImage } from './types';

type HistoryProps = {};

const History: React.FC<HistoryProps> = () => {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12; // Number of items per page
  const offset = (currentPage - 1) * pageSize;

  const {
    data: historyData,
    isLoading: historyLoading,
    mutate: refreshHistory,
  } = useAPI('diffusion', ['getHistory'], { limit: pageSize, offset });

  // Calculate pagination info
  const totalPages = historyData?.total
    ? Math.ceil(historyData.total / pageSize)
    : 1;

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

  // Pagination functions
  const goToPage = (page: number) => {
    setCurrentPage(page);
    // Keep selections and selection mode when changing pages
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  };

  // View image in modal
  const viewImage = async (imageId: string) => {
    try {
      const response = await fetch(
        getAPIFullPath('diffusion', ['getImageInfo'], { imageId }),
      );
      const data = await response.json();
      setSelectedImage(data);
      setImageModalOpen(true);
    } catch (e) {
      // Error loading image
    }
  };

  // Delete single image
  const deleteImage = async (imageId: string) => {
    try {
      await fetch(getAPIFullPath('diffusion', ['deleteImage'], { imageId }), {
        method: 'DELETE',
      });
      refreshHistory(); // Reload history
      setDeleteConfirmOpen(false);
      setImageToDelete(null);
      const remaining = (historyData?.total || 1) - 1;
      const newTotalPages = Math.ceil(remaining / pageSize);
      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
      } else {
        refreshHistory();
      }
    } catch (e) {
      // Error deleting image
    }
  };

  // Delete selected images
  const deleteSelectedImages = async () => {
    try {
      // Delete all selected images
      await Promise.all(
        Array.from(selectedImages).map((imageId) =>
          fetch(getAPIFullPath('diffusion', ['deleteImage'], { imageId }), {
            method: 'DELETE',
          }),
        ),
      );
      refreshHistory(); // Reload history
      setSelectedImages(new Set());
      setSelectionMode(false);
      setDeleteConfirmOpen(false);
      const remaining = (historyData?.total || 1) - 1;
      const newTotalPages = Math.ceil(remaining / pageSize);
      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
      } else {
        refreshHistory();
      }
    } catch (e) {
      // Error deleting images
    }
  };

  // Clear all history
  const clearAllHistory = async () => {
    try {
      await fetch(getAPIFullPath('diffusion', ['clearHistory'], {}), {
        method: 'DELETE',
      });
      refreshHistory(); // Reload history
    } catch (e) {
      // Error clearing history
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
    // Only select images on current page
    const currentPageIds = new Set<string>(
      historyData.images.map((img: HistoryImage) => img.id),
    );
    setSelectedImages(currentPageIds);
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
        getAPIFullPath('diffusion', ['createDataset'], {}),
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
                  Select All on Page
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
                  {selectedImages.size} selected in total
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
          <>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  mt: 3,
                  gap: 1,
                  [`& .${iconButtonClasses.root}`]: { borderRadius: '50%' },
                }}
              >
                {currentPage > 1 ? (
                  <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    onClick={goToPreviousPage}
                  >
                    <ChevronLeftIcon /> Previous
                  </Button>
                ) : (
                  <div style={{ width: '78px', height: '30px' }} />
                )}

                <Box sx={{ flex: 1, alignItems: 'center' }} />

                {/* Page number buttons */}
                {totalPages <= 7 ? (
                  // For 7 or fewer pages, show all pages
                  Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => (
                      <IconButton
                        key={page}
                        size="sm"
                        variant={page === currentPage ? 'outlined' : 'plain'}
                        color="neutral"
                        onClick={() => goToPage(page)}
                      >
                        {page}
                      </IconButton>
                    ),
                  )
                ) : (
                  // For more than 7 pages, use ellipsis logic
                  <>
                    <IconButton
                      key={1}
                      size="sm"
                      variant={Number(1) === currentPage ? 'outlined' : 'plain'}
                      color="neutral"
                      onClick={() => goToPage(Number(1))}
                    >
                      {1}
                    </IconButton>

                    {/* Show ellipsis only if there's a gap between first page and visible range */}
                    {currentPage > 4 && (
                      <Typography level="body-sm">…</Typography>
                    )}

                    {/* Show middle pages */}
                    {Array.from(
                      { length: Math.min(5, totalPages) },
                      (_, i) => currentPage + i - 2,
                    )
                      .filter((page) => page >= 2 && page < totalPages)
                      .map((page) => (
                        <IconButton
                          key={page}
                          size="sm"
                          variant={page === currentPage ? 'outlined' : 'plain'}
                          color="neutral"
                          onClick={() => goToPage(Number(page))}
                        >
                          {page}
                        </IconButton>
                      ))}

                    {/* Show ellipsis only if there's a gap between visible range and last page */}
                    {currentPage < totalPages - 3 && (
                      <Typography level="body-sm">…</Typography>
                    )}

                    {/* Show last page */}
                    <IconButton
                      key={totalPages}
                      size="sm"
                      variant={
                        Number(totalPages) === currentPage
                          ? 'outlined'
                          : 'plain'
                      }
                      color="neutral"
                      onClick={() => goToPage(Number(totalPages))}
                    >
                      {totalPages}
                    </IconButton>
                  </>
                )}

                <Box sx={{ flex: 1 }} />

                {currentPage < totalPages ? (
                  <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    onClick={goToNextPage}
                  >
                    Next <ChevronRightIcon />
                  </Button>
                ) : (
                  <div style={{ width: '78px', height: '30px' }} />
                )}
              </Box>
            )}

            {/* Total count display */}
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography level="body-sm" color="neutral">
                Showing {historyData.images.length} of {historyData.total} total
                images (Page {currentPage} of {totalPages})
              </Typography>
            </Box>
          </>
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
