import React from 'react';
import {
  Box,
  Typography,
  Button,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
} from '@mui/joy';
import { DownloadIcon, DeleteIcon } from 'lucide-react';
import { HistoryImage } from './History';

interface HistoryImageModalProps {
  open: boolean;
  image: HistoryImage | null;
  onClose: () => void;
  onDownload: (image: HistoryImage) => void;
  onDeleteClick: (imageId: string) => void;
}

const HistoryImageModal: React.FC<HistoryImageModalProps> = ({
  open,
  image,
  onClose,
  onDownload,
  onDeleteClick,
}) => {
  return (
    <Modal open={open} onClose={onClose}>
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
        {image && (
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
                    src={`data:image/png;base64,${image.image_base64}`}
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
                    {image.metadata.prompt}
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
                    <strong>Model:</strong> {image.metadata.model}
                    {image.metadata.adaptor && (
                      <>
                        <br />
                        <strong>Adaptor:</strong> {image.metadata.adaptor}
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
                    <strong>Steps:</strong> {image.metadata.num_inference_steps}{' '}
                    <br />
                    <strong>Guidance:</strong> {image.metadata.guidance_scale}{' '}
                    <br />
                    <strong>Seed:</strong> {image.metadata.seed}
                    {image.metadata.upscale && (
                      <>
                        <br />
                        <strong>Upscale:</strong>{' '}
                        {image.metadata.upscale_factor}x
                      </>
                    )}
                    {image.metadata.negative_prompt && (
                      <>
                        <br />
                        <strong>Negative Prompt:</strong>{' '}
                        {image.metadata.negative_prompt}
                      </>
                    )}
                    {image.metadata.eta !== undefined &&
                      image.metadata.eta !== null && (
                        <>
                          <br />
                          <strong>ETA:</strong> {image.metadata.eta}
                        </>
                      )}
                    {image.metadata.clip_skip !== undefined &&
                      image.metadata.clip_skip !== null && (
                        <>
                          <br />
                          <strong>CLIP Skip:</strong> {image.metadata.clip_skip}
                        </>
                      )}
                    {image.metadata.guidance_rescale !== undefined &&
                      image.metadata.guidance_rescale !== null && (
                        <>
                          <br />
                          <strong>Guidance Rescale:</strong>{' '}
                          {image.metadata.guidance_rescale}
                        </>
                      )}
                    {image.metadata.width !== undefined &&
                      image.metadata.width !== null && (
                        <>
                          <br />
                          <strong>Width:</strong> {image.metadata.width}
                        </>
                      )}
                    {image.metadata.height !== undefined &&
                      image.metadata.height !== null && (
                        <>
                          <br />
                          <strong>Height:</strong> {image.metadata.height}
                        </>
                      )}
                  </Typography>
                  <Box
                    sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}
                  >
                    <Button
                      onClick={() => onDownload(image)}
                      startDecorator={<DownloadIcon size="16px" />}
                      variant="solid"
                      color="primary"
                    >
                      Download
                    </Button>
                    <Button
                      color="danger"
                      variant="outlined"
                      onClick={() => onDeleteClick(image.id)}
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
  );
};

export default HistoryImageModal;
