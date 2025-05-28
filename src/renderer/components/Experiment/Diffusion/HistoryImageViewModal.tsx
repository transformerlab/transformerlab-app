import {
  Box,
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from '@mui/joy';
import { DeleteIcon, DownloadIcon, Trash2Icon } from 'lucide-react';
import React from 'react';
import { Endpoints } from 'renderer/lib/transformerlab-api-sdk';

export default function HistoryImageViewModal({
  selectedImage,
  setImageModalOpen,
  imageModalOpen,
  setImageToDelete,
  setDeleteConfirmOpen,
  downloadHistoryImage,
}) {
  // Add your hooks and logic here
  return (
    <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
      <ModalDialog
        sx={{
          width: '70vw',
          maxHeight: '95vh',
        }}
      >
        <ModalClose />
        {selectedImage && (
          <>
            <DialogTitle sx={{ pb: 2 }}>Generated Image</DialogTitle>
            <DialogContent sx={{ p: 0, overflowY: 'auto' }}>
              <Box sx={{ textAlign: 'center' }}>
                <Box
                  sx={{
                    p: 1,
                    mb: 3,
                  }}
                >
                  <img
                    src={Endpoints.Diffusion.GetImage(selectedImage?.id)}
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
                          <strong>Width:</strong> {selectedImage.metadata.width}
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
                </Box>
              </Box>
            </DialogContent>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
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
                startDecorator={<Trash2Icon size="16px" />}
              >
                Delete
              </Button>
            </Box>
          </>
        )}
      </ModalDialog>
    </Modal>
  );
}
