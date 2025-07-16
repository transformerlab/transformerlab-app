import {
  Box,
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
  IconButton,
  Stack,
} from '@mui/joy';
import {
  DownloadIcon,
  Trash2Icon,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { HistoryImage } from './types';

export default function HistoryImageViewModal({
  selectedImage,
  setImageModalOpen,
  imageModalOpen,
  setImageToDelete,
  setDeleteConfirmOpen,
}: {
  selectedImage: HistoryImage | null;
  setImageModalOpen: (open: boolean) => void;
  imageModalOpen: boolean;
  setImageToDelete: (id: string) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [numImages, setNumImages] = useState(1);
  // const [hoveringMainImage, setHoveringMainImage] = useState(false);

  // Load all images for the selected item when modal opens
  useEffect(() => {
    if (selectedImage?.metadata && imageModalOpen) {
      console.log('Selected image metadata:', selectedImage?.metadata);
      const imageCount =
        selectedImage.num_images || selectedImage.metadata?.num_images || 1;
      setNumImages(imageCount);
      setCurrentImageIndex(0);

      const urls = Array.from({ length: imageCount }, (_, index) =>
        getAPIFullPath('diffusion', ['getImage'], {
          imageId: selectedImage.id,
          index,
        }),
      );

      // Append input and processed ControlNet images if present
      if (selectedImage.metadata.is_controlnet !== 'off') {
        if (selectedImage.metadata.input_image_path) {
          urls.push(
            getAPIFullPath('diffusion', ['getInputImage'], {
              imageId: selectedImage.id,
            }),
          );
        }

        if (selectedImage.metadata.processed_image) {
          urls.push(
            getAPIFullPath('diffusion', ['getProcessedImage'], {
              imageId: selectedImage.id,
              processed: true,
            }),
          );
        }
      }
      console.log('URLs: ', urls);
      setImageUrls(urls);
    }
  }, [selectedImage, imageModalOpen]);

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : numImages - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev < numImages - 1 ? prev + 1 : 0));
  };

  const downloadAllImages = async () => {
    if (!selectedImage?.id) return;

    try {
      // Create a link to download all images as zip
      const link = document.createElement('a');
      link.href = getAPIFullPath('diffusion', ['getAllImages'], {
        imageId: selectedImage.id,
      });

      // Generate filename with timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      link.download = `diffusion_images_${timestamp}.zip`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download images:', err);
    }
  };

  // ...existing code...

  // Add your hooks and logic here
  return (
    <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
      <ModalDialog
        sx={{
          width: '90vw',
          height: '95vh',
        }}
      >
        <ModalClose />
        {selectedImage && (
          <>
            <DialogTitle sx={{ pb: 2 }}>
              Generated Image{numImages > 1 ? 's' : ''}
              {numImages > 1 && (
                <Typography
                  level="body-sm"
                  sx={{ ml: 2, color: 'text.tertiary' }}
                >
                  Image {currentImageIndex + 1} of {numImages}
                </Typography>
              )}
            </DialogTitle>
            <DialogContent sx={{ p: 0, overflowY: 'auto' }}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  alignItems: { xs: 'center', md: 'flex-start' },
                  gap: 3,
                  width: '100%',
                }}
              >
                <Box
                  sx={{
                    p: 1,
                    mb: { xs: 3, md: 0 },
                    textAlign: 'center',
                    position: 'relative',
                  }}
                  id="image-preview"
                  // onMouseEnter={() => {
                  //   setHoveringMainImage(true);
                  // }}
                  // onMouseLeave={() => setHoveringMainImage(false)
                  // }
                >
                  {/* Navigation buttons for multiple images */}
                  {numImages > 1 && (
                    <>
                      <IconButton
                        onClick={handlePreviousImage}
                        sx={{
                          position: 'absolute',
                          left: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          color: 'white',
                          '&:hover': {
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                          },
                        }}
                      >
                        <ChevronLeft />
                      </IconButton>
                      <IconButton
                        onClick={handleNextImage}
                        sx={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          color: 'white',
                          '&:hover': {
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                          },
                        }}
                      >
                        <ChevronRight />
                      </IconButton>
                    </>
                  )}

                  <img
                    src={
                      imageUrls[currentImageIndex] ||
                      getAPIFullPath('diffusion', ['getImage'], {
                        imageId: selectedImage?.id,
                        index: currentImageIndex,
                      })
                    }
                    alt="Generated"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '70vh',
                      objectFit: 'contain',
                      borderRadius: '6px',
                      margin: '0 auto',
                      display: 'block',
                      // display:
                      //   hoveringMainImage &&
                      //   selectedImage.metadata.is_inpainting
                      //     ? 'none'
                      //     : 'block',
                    }}
                  />
                  {selectedImage.metadata.is_inpainting &&
                    selectedImage.metadata.input_image_path && (
                      <>
                        <img
                          src={getAPIFullPath('diffusion', ['getInputImage'], {
                            imageId: selectedImage?.id,
                          })}
                          alt="Input"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '70vh',
                            objectFit: 'contain',
                            borderRadius: '6px',
                            margin: '0 auto',
                            display: 'none',
                            // display: hoveringMainImage ? 'block' : 'none',
                          }}
                        />
                        {/* {hoveringMainImage ? (
                          <Typography level="body-sm" sx={{ mt: 1 }}>
                            Original Image
                          </Typography>
                        ) : (
                          <Typography level="body-sm" sx={{ mt: 1 }}>
                            Hover to view original image
                          </Typography>
                        )} */}
                      </>
                    )}
                  {/* Thumbnail navigation for multiple images */}
                  {numImages > 1 && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        mt: 2,
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        gap: 1,
                      }}
                    >
                      {imageUrls.map((url, index) => (
                        <Box
                          key={`thumbnail-${url}`}
                          onClick={() => setCurrentImageIndex(index)}
                          sx={{
                            cursor: 'pointer',
                            border:
                              index === currentImageIndex
                                ? '2px solid var(--joy-palette-primary-500)'
                                : '1px solid var(--joy-palette-neutral-300)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            width: 60,
                            height: 60,
                          }}
                        >
                          <img
                            src={url}
                            alt={`Thumbnail ${index + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
                <Box
                  sx={{
                    textAlign: 'left',
                    flex: 1,
                    width: { xs: '100%', md: 'auto' },
                    pr: 1,
                  }}
                  id="image-metadata"
                >
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

                  {selectedImage.metadata.is_img2img &&
                    selectedImage.metadata.input_image_path && (
                      <>
                        <Typography level="title-md" sx={{ mb: 1 }}>
                          Input Image:
                        </Typography>
                        <Box
                          sx={{
                            mb: 2,
                            p: 2,
                            backgroundColor:
                              'var(--joy-palette-background-level1)',
                            borderRadius: '6px',
                            textAlign: 'center',
                          }}
                        >
                          <img
                            src={getAPIFullPath(
                              'diffusion',
                              ['getInputImage'],
                              {
                                imageId: selectedImage?.id,
                              },
                            )}
                            alt="Input"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '200px',
                              objectFit: 'contain',
                              borderRadius: '6px',
                              border:
                                '1px solid var(--joy-palette-neutral-300)',
                            }}
                          />
                        </Box>
                      </>
                    )}

                  {selectedImage.metadata.is_inpainting &&
                    selectedImage.metadata.input_image_path && (
                      <>
                        <Typography level="title-md" sx={{ mb: 1 }}>
                          Input Image:
                        </Typography>
                        <Box
                          sx={{
                            mb: 2,
                            p: 2,
                            backgroundColor:
                              'var(--joy-palette-background-level1)',
                            borderRadius: '6px',
                            textAlign: 'center',
                          }}
                        >
                          <img
                            src={getAPIFullPath(
                              'diffusion',
                              ['getInputImage'],
                              {
                                imageId: selectedImage?.id,
                              },
                            )}
                            alt="Input"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '200px',
                              objectFit: 'contain',
                              borderRadius: '6px',
                              border:
                                '1px solid var(--joy-palette-neutral-300)',
                            }}
                          />
                        </Box>
                      </>
                    )}

                  {selectedImage.metadata.is_inpainting &&
                    selectedImage.metadata.mask_image_path && (
                      <>
                        <Typography level="title-md" sx={{ mb: 1 }}>
                          Mask Image:
                        </Typography>
                        <Box
                          sx={{
                            mb: 2,
                            p: 2,
                            backgroundColor:
                              'var(--joy-palette-background-level1)',
                            borderRadius: '6px',
                            textAlign: 'center',
                          }}
                        >
                          <img
                            src={getAPIFullPath('diffusion', ['getMaskImage'], {
                              imageId: selectedImage?.id,
                            })}
                            alt="Mask"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '200px',
                              objectFit: 'contain',
                              borderRadius: '6px',
                              border:
                                '1px solid var(--joy-palette-neutral-300)',
                            }}
                          />
                        </Box>
                      </>
                    )}
                  <Stack
                    direction="row"
                    spacing={2}
                    justifyContent="center"
                    alignItems="center"
                    flexWrap="nowrap"
                  >
                    {selectedImage.metadata.input_image_path && (
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography level="body-sm" sx={{ mb: 1 }}>
                          Input
                        </Typography>
                        <img
                          src={getAPIFullPath('diffusion', ['getInputImage'], {
                            imageId: selectedImage?.id,
                          })}
                          alt="ControlNet Input"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '200px',
                            objectFit: 'contain',
                            borderRadius: '6px',
                            border: '1px solid var(--joy-palette-neutral-300)',
                          }}
                        />
                      </Box>
                    )}

                    {selectedImage.metadata.input_image_path &&
                      selectedImage.metadata.processed_image && (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            px: 1,
                          }}
                        >
                          <ArrowRight />
                          <Typography level="body-xs" sx={{ mt: 0.5 }}>
                            Processed
                          </Typography>
                        </Box>
                      )}

                    {selectedImage.metadata.processed_image && (
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography level="body-sm" sx={{ mb: 1 }}>
                          Output
                        </Typography>
                        <img
                          src={getAPIFullPath(
                            'diffusion',
                            ['getProcessedImage'],
                            {
                              imageId: selectedImage?.id,
                              processed: true,
                            },
                          )}
                          alt="Preprocessed"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '200px',
                            objectFit: 'contain',
                            borderRadius: '6px',
                            border: '1px solid var(--joy-palette-neutral-300)',
                          }}
                        />
                      </Box>
                    )}
                  </Stack>
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
                        {selectedImage.metadata.adaptor_scale !== undefined && (
                          <>
                            {' '}
                            (Strength: {selectedImage.metadata.adaptor_scale})
                          </>
                        )}
                      </>
                    )}
                    {selectedImage.metadata.is_img2img && (
                      <>
                        <br />
                        <strong>Type:</strong> Image-to-Image Generation
                      </>
                    )}
                    {selectedImage.metadata.is_inpainting && (
                      <>
                        <br />
                        <strong>Type:</strong> Inpainting Generation
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
                    {numImages > 1 && (
                      <>
                        <br />
                        <strong>Number of Images:</strong> {numImages}
                      </>
                    )}
                    {(selectedImage.metadata.is_img2img ||
                      selectedImage.metadata.is_inpainting) && (
                      <>
                        <br />
                        <strong>Strength:</strong>{' '}
                        {selectedImage.metadata.strength || 0.8}
                      </>
                    )}
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
                    {selectedImage.metadata.generation_time !== undefined &&
                      selectedImage.metadata.generation_time !== null && (
                        <>
                          <br />
                          <strong>Generation Time:</strong>{' '}
                          {selectedImage.metadata.generation_time.toFixed(2)}s
                        </>
                      )}
                    {selectedImage.metadata.scheduler && (
                      <>
                        <br />
                        <strong>Scheduler:</strong>{' '}
                        {selectedImage.metadata.scheduler}
                      </>
                    )}
                    {selectedImage.metadata.is_controlnet !== 'off' && (
                      <>
                        <br />
                        <strong>ControlNet:</strong>{' '}
                        {selectedImage.metadata.is_controlnet}
                      </>
                    )}
                  </Typography>
                </Box>
              </Box>
            </DialogContent>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                onClick={downloadAllImages}
                startDecorator={<DownloadIcon size="16px" />}
                variant="solid"
                color="primary"
              >
                Download{numImages > 1 ? ` All` : ''}
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
