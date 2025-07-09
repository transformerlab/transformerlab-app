import React, { useState, useCallback, Dispatch, SetStateAction } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  IconButton,
  Typography,
  Stack,
  FormControl,
  Input,
  CircularProgress,
  FormLabel,
  Tooltip,
  Sheet,
} from '@mui/joy';
import {
  EraserIcon,
  PencilIcon,
  Upload,
  Trash2,
  ChevronLeft,
  ChevronRight,
  HistoryIcon,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

import { RxMaskOff, RxMaskOn } from 'react-icons/rx';

import SimpleTextArea from 'renderer/components/Shared/SimpleTextArea';
import ReactCanvasPaint from '../../Shared/ReactCanvasPaint/ReactCanvasPaint';
import HistoryImageSelector from './HistoryImageSelector';

// Helper component for labels with tooltips
const LabelWithTooltip = ({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip: string;
}) => (
  <Stack direction="row" alignItems="center" gap={0.01}>
    <FormLabel>{children}</FormLabel>
    <Tooltip
      title={tooltip}
      arrow
      placement="top"
      sx={{ maxWidth: 200 }}
      variant="soft"
    >
      <IconButton
        size="sm"
        variant="plain"
        color="neutral"
        sx={{ minHeight: 'unset', p: 0.125, alignSelf: 'flex-start' }}
      >
        <Info size={12} color="var(--joy-palette-neutral-400)" />
      </IconButton>
    </Tooltip>
  </Stack>
);

interface InpaintingProps {
  model: string;
  adaptor: string;
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  inputImageBase64: string;
  setInputImageBase64: Dispatch<SetStateAction<string>>;
  setMaskImageBase64: Dispatch<SetStateAction<string>>;
  strength: number;
  setStrength: Dispatch<SetStateAction<number>>;
  numSteps: number;
  setNumSteps: Dispatch<SetStateAction<number>>;
  guidanceScale: number;
  setGuidanceScale: Dispatch<SetStateAction<number>>;
  seed: string;
  setSeed: Dispatch<SetStateAction<string>>;
  negativePrompt: string;
  setNegativePrompt: Dispatch<SetStateAction<string>>;
  onGenerate: () => void;
  loading: boolean;
  error: string;
  generatedImages: string[];
  currentImageIndex: number;
  setCurrentImageIndex: Dispatch<SetStateAction<number>>;
  handlePreviousImage: () => void;
  handleNextImage: () => void;
  handleSaveAllImages: () => void;
  currentGenerationData: any;
  isInpaintingEligible: boolean | null;
  imageWidth: string;
  setImageWidth: Dispatch<SetStateAction<string>>;
  imageHeight: string;
  setImageHeight: Dispatch<SetStateAction<string>>;
  numImages: number;
  setNumImages: Dispatch<SetStateAction<number>>;
}

export default function Inpainting({
  model,
  adaptor,
  prompt,
  setPrompt,
  inputImageBase64,
  setInputImageBase64,
  setMaskImageBase64,
  strength,
  setStrength,
  numSteps,
  setNumSteps,
  guidanceScale,
  setGuidanceScale,
  seed,
  setSeed,
  negativePrompt,
  setNegativePrompt,
  onGenerate,
  loading,
  error,
  generatedImages,
  currentImageIndex,
  setCurrentImageIndex,
  handlePreviousImage,
  handleNextImage,
  handleSaveAllImages,
  currentGenerationData,
  isInpaintingEligible = null,
  imageWidth,
  setImageWidth,
  imageHeight,
  setImageHeight,
  numImages,
  setNumImages,
}: InpaintingProps) {
  const [strokeSize, setStrokeSize] = useState(20);
  const [drawMode, setDrawMode] = useState<'pencil' | 'eraser'>('pencil');
  const [canvasKey, setCanvasKey] = useState(0);
  const [imageDimensions, setImageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [maskRenderStyle, setMaskRenderStyle] = useState('red');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Calculate actual image dimensions and canvas positioning
  const updateCanvasDimensions = useCallback(() => {
    if (imageRef.current && containerRef.current) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();

      // Load the image to get its natural dimensions
      const img = new Image();
      img.onload = () => {
        const containerAspect = containerRect.width / containerRect.height;
        const imageAspect = img.naturalWidth / img.naturalHeight;

        let displayWidth;
        let displayHeight;

        if (imageAspect > containerAspect) {
          // Image is wider, fit to width
          displayWidth = containerRect.width;
          displayHeight = displayWidth / imageAspect;
        } else {
          // Image is taller, fit to height
          displayHeight = containerRect.height;
          displayWidth = displayHeight * imageAspect;
        }

        setImageDimensions({
          width: displayWidth,
          height: displayHeight,
        });
      };
      img.src = `data:image/png;base64,${inputImageBase64}`;
    }
  }, [inputImageBase64]);

  // Update dimensions when image changes or window resizes
  React.useEffect(() => {
    if (inputImageBase64) {
      updateCanvasDimensions();
    }
  }, [inputImageBase64, updateCanvasDimensions]);

  // React.useEffect(() => {
  //   const handleResize = () => {
  //     if (inputImageBase64) {
  //       //updateCanvasDimensions();
  //     }
  //   };

  //   window.addEventListener('resize', handleResize);
  //   return () => window.removeEventListener('resize', handleResize);
  // }, [inputImageBase64, updateCanvasDimensions]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const base64String = result.split(',')[1];
        setInputImageBase64(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectFromHistory = (imageBase64: string) => {
    setInputImageBase64(imageBase64);
    setHistoryModalOpen(false);
  };

  const handleClearMask = () => {
    setMaskImageBase64('');
    // Force canvas to re-render and clear by changing the key
    setCanvasKey((prev) => prev + 1);
  };

  const handleCanvasDraw = useCallback(
    (imageData: ImageData) => {
      if (imageDimensions.width === 0 || imageDimensions.height === 0) {
        return;
      }

      // Create a canvas with the actual image dimensions for the mask
      const img = new Image();
      img.onload = () => {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = img.naturalWidth;
        maskCanvas.height = img.naturalHeight;
        const maskCtx = maskCanvas.getContext('2d');

        if (maskCtx) {
          // Scale the canvas drawing to match the original image size
          const scaleX = img.naturalWidth / imageDimensions.width;
          const scaleY = img.naturalHeight / imageDimensions.height;

          // Create a temporary canvas to scale the drawing
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = imageDimensions.width;
          tempCanvas.height = imageDimensions.height;
          const tempCtx = tempCanvas.getContext('2d');

          if (tempCtx) {
            tempCtx.putImageData(imageData, 0, 0);

            // Scale and draw to the mask canvas
            maskCtx.scale(scaleX, scaleY);
            maskCtx.drawImage(tempCanvas, 0, 0);

            const dataUrl = maskCanvas.toDataURL('image/png');
            const base64String = dataUrl.split(',')[1];
            setMaskImageBase64(base64String);
          }
        }
      };
      img.src = `data:image/png;base64,${inputImageBase64}`;
    },
    [setMaskImageBase64, imageDimensions, inputImageBase64],
  );

  const handleInpaintingGenerate = () => {
    onGenerate();
  };

  let maskCSSFilter = '';
  if (maskRenderStyle === 'masked') {
    maskCSSFilter = 'invert(0)';
  }
  if (maskRenderStyle === 'red') {
    maskCSSFilter = 'invert(0.6) sepia(1) saturate(30) hue-rotate(-30deg)';
  }
  if (maskRenderStyle === 'maskonly') {
    maskCSSFilter = 'invert(1)';
  }
  return (
    <Stack
      direction="row"
      sx={{
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
      spacing={2}
    >
      {/* Left Panel - Controls */}
      <Stack
        sx={{
          width: '30%',
          minWidth: 380,
          maxWidth: 480,
          height: '100%',
          overflow: 'auto',
          p: 2,
          flexShrink: 0,
        }}
        spacing={2}
      >
        <Typography level="h4">Inpainting</Typography>

        {/* Model and Adaptor Fields */}
        <FormControl>
          <LabelWithTooltip tooltip="The foundation model being used for image generation. This determines the style and capabilities of the generated images.">
            Model
          </LabelWithTooltip>
          <Input
            value={model}
            disabled
            readOnly
            placeholder="Model name or path"
          />
        </FormControl>
        {adaptor && (
          <FormControl>
            <LabelWithTooltip tooltip="Optional LoRA adaptor model that modifies the base model's behavior based on fine-tuned styles.">
              Adaptor
            </LabelWithTooltip>
            <Input
              value={adaptor}
              disabled
              readOnly
              placeholder="Adaptor name or path"
            />
          </FormControl>
        )}

        {/* Image Upload */}
        <FormControl>
          <LabelWithTooltip tooltip="Upload an image to use as a reference for inpainting. The image will be displayed for you to mask areas that you want to modify.">
            Reference Image
          </LabelWithTooltip>
          {!inputImageBase64 ? (
            <Stack spacing={1}>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
                id="inpainting-image-upload"
              />
              <Button
                component="label"
                htmlFor="inpainting-image-upload"
                variant="outlined"
                startDecorator={<Upload />}
                fullWidth
              >
                Upload Image
              </Button>
              <Button
                variant="outlined"
                startDecorator={<HistoryIcon />}
                onClick={() => setHistoryModalOpen(true)}
                fullWidth
              >
                From History
              </Button>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <Box
                sx={{
                  width: '100%',
                  height: 120,
                  border: '1px solid',
                  borderColor: 'neutral.300',
                  borderRadius: 1,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={`data:image/png;base64,${inputImageBase64}`}
                  alt="Reference"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              </Box>
              <Button
                variant="outlined"
                color="danger"
                startDecorator={<Trash2 />}
                onClick={() => setInputImageBase64('')}
                size="sm"
              >
                Remove Image
              </Button>
            </Stack>
          )}
        </FormControl>

        {/* Painting Tools */}
        {inputImageBase64 && (
          <>
            <FormControl>
              <FormLabel>Tools</FormLabel>
              <ButtonGroup>
                <IconButton
                  variant={drawMode === 'pencil' ? 'solid' : 'outlined'}
                  onClick={() => setDrawMode('pencil')}
                >
                  <PencilIcon />
                </IconButton>
                <IconButton
                  variant={drawMode === 'eraser' ? 'solid' : 'outlined'}
                  onClick={() => setDrawMode('eraser')}
                >
                  <EraserIcon />
                </IconButton>
                <Tooltip title="Apply Mask to Image">
                  <IconButton
                    onClick={() => setMaskRenderStyle('masked')}
                    variant={maskRenderStyle === 'masked' ? 'soft' : 'outlined'}
                  >
                    <RxMaskOn />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Red Mask Style">
                  <IconButton
                    onClick={() => setMaskRenderStyle('red')}
                    variant={maskRenderStyle === 'red' ? 'soft' : 'outlined'}
                  >
                    <RxMaskOn color="red" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Show Mask Only">
                  <IconButton
                    onClick={() => setMaskRenderStyle('maskonly')}
                    variant={
                      maskRenderStyle === 'maskonly' ? 'soft' : 'outlined'
                    }
                  >
                    <RxMaskOff />
                  </IconButton>
                </Tooltip>
              </ButtonGroup>
            </FormControl>

            <FormControl>
              <FormLabel>Brush Size</FormLabel>
              <ButtonGroup>
                {[5, 10, 20, 30, 50].map((size) => (
                  <Button
                    key={size}
                    variant={strokeSize === size ? 'solid' : 'outlined'}
                    onClick={() => setStrokeSize(size)}
                    size="sm"
                  >
                    <Box
                      sx={{
                        width: Math.min(size / 2, 20),
                        height: Math.min(size / 2, 20),
                        borderRadius: '50%',
                        backgroundColor: 'currentColor',
                      }}
                    />
                  </Button>
                ))}
              </ButtonGroup>
            </FormControl>

            <Button
              variant="outlined"
              color="warning"
              onClick={handleClearMask}
              startDecorator={<Trash2 />}
            >
              Clear Mask
            </Button>
          </>
        )}

        {/* Generation Settings */}
        <FormControl>
          <LabelWithTooltip tooltip="Describe the image you want to generate in the masked areas. Be specific and detailed for better results.">
            Prompt
          </LabelWithTooltip>
          <SimpleTextArea value={prompt} setValue={setPrompt} />
        </FormControl>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            rowGap: 2,
            columnGap: 1,
          }}
        >
          <FormControl sx={{ flex: 1, justifyContent: 'space-between' }}>
            <LabelWithTooltip tooltip="Number of denoising steps. More steps generally produce higher quality images but take longer to generate. Typical values range from 20-50.">
              Steps
            </LabelWithTooltip>
            <Input
              type="number"
              value={numSteps}
              sx={{ width: 100 }}
              onChange={(e) => setNumSteps(Number(e.target.value))}
            />
          </FormControl>
          <FormControl sx={{ flex: 1, justifyContent: 'space-between' }}>
            <LabelWithTooltip tooltip="Controls how closely the model follows your prompt. Higher values (7-15) follow the prompt more strictly, lower values (1-7) allow more creative interpretation.">
              Guidance Scale
            </LabelWithTooltip>
            <Input
              type="number"
              value={guidanceScale}
              sx={{ width: 100 }}
              onChange={(e) => setGuidanceScale(Number(e.target.value))}
            />
          </FormControl>
          <FormControl sx={{ flex: 1, justifyContent: 'space-between' }}>
            <LabelWithTooltip tooltip="Controls how much the AI modifies the masked regions. Lower values (0.1-0.5) make subtle changes, higher values (0.6-1.0) make dramatic changes.">
              Strength
            </LabelWithTooltip>
            <Input
              type="number"
              value={strength}
              sx={{ width: 100 }}
              onChange={(e) => setStrength(Number(e.target.value))}
              slotProps={{
                input: {
                  step: 0.1,
                  min: 0.1,
                  max: 1.0,
                },
              }}
            />
          </FormControl>
          <FormControl sx={{ flex: 1, justifyContent: 'space-between' }}>
            <LabelWithTooltip tooltip="Random seed for reproducibility. Leave empty for random generation, or use a specific number to generate the same image repeatedly.">
              Seed (optional)
            </LabelWithTooltip>
            <Input
              type="number"
              value={seed}
              sx={{ width: 100 }}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Random"
            />
          </FormControl>
          <FormControl sx={{ flex: 1, justifyContent: 'space-between' }}>
            <LabelWithTooltip tooltip="Number of images to generate in parallel. Higher values will take longer but produce more options to choose from.">
              Number of Images
            </LabelWithTooltip>
            <Input
              type="number"
              value={numImages}
              sx={{ width: 100 }}
              onChange={(e) => setNumImages(Number(e.target.value))}
              slotProps={{
                input: {
                  min: 1,
                  max: 8,
                  step: 1,
                },
              }}
            />
          </FormControl>
        </Box>

        <Sheet variant="soft" sx={{ p: 2, mt: 1 }}>
          {/* Advanced Settings Toggle */}
          <Button
            variant="outlined"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            sx={{ alignSelf: 'flex-start' }}
            endDecorator={
              showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />
            }
          >
            {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
          </Button>

          {/* Advanced Settings - Collapsible */}
          {showAdvanced && (
            <Stack gap={2} sx={{ mt: 1 }}>
              <FormControl>
                <LabelWithTooltip tooltip="Describe what you don't want to see in the generated image. This helps guide the model away from unwanted elements, styles, or features.">
                  Negative Prompt
                </LabelWithTooltip>
                <SimpleTextArea
                  rows={2}
                  value={negativePrompt}
                  setValue={setNegativePrompt}
                  placeholder="Describe what you don't want to see"
                />
              </FormControl>
              <Stack
                gap={1}
                sx={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-start',
                }}
              >
                <FormControl sx={{}}>
                  <LabelWithTooltip tooltip="Set a custom width for the generated image in pixels. Leave at 0 to use the model's default width. Values should be multiples of 8.">
                    Image Width
                  </LabelWithTooltip>
                  <Input
                    type="number"
                    value={imageWidth}
                    sx={{ width: 100 }}
                    onChange={(e) => setImageWidth(e.target.value)}
                    placeholder="0"
                    slotProps={{
                      input: {
                        step: 8,
                        min: 0,
                      },
                    }}
                  />
                </FormControl>
                <FormControl sx={{}}>
                  <LabelWithTooltip tooltip="Set a custom height for the generated image in pixels. Leave at 0 to use the model's default height. Values should be multiples of 8.">
                    Image Height
                  </LabelWithTooltip>
                  <Input
                    type="number"
                    value={imageHeight}
                    sx={{ width: 100 }}
                    onChange={(e) => setImageHeight(e.target.value)}
                    placeholder="0"
                    slotProps={{
                      input: {
                        step: 8,
                        min: 0,
                      },
                    }}
                  />
                </FormControl>
              </Stack>
            </Stack>
          )}
        </Sheet>

        <Button
          onClick={handleInpaintingGenerate}
          disabled={
            loading || !inputImageBase64 || isInpaintingEligible === false
          }
          color="primary"
          size="lg"
          startDecorator={loading && <CircularProgress size="sm" />}
        >
          {loading ? 'Generating...' : 'Generate Inpainting'}
        </Button>

        {/* Inpainting Eligibility Check */}
        {isInpaintingEligible === false && (
          <Typography color="danger" level="body-sm">
            This model does not support inpainting. Please select a different
            model or use the Generate tab for basic image generation.
          </Typography>
        )}

        {isInpaintingEligible === null && inputImageBase64 && (
          <Typography color="warning" level="body-sm">
            Checking model compatibility for inpainting...
          </Typography>
        )}

        {error && (
          <Typography color="danger" level="body-sm">
            {error}
          </Typography>
        )}
      </Stack>

      {/* Right Panel - Canvas and Results */}
      <Stack
        sx={{
          flex: 1,
          height: '100%',
          overflow: 'auto',
          p: 2,
        }}
        spacing={2}
      >
        {/* Canvas Area */}
        {inputImageBase64 ? (
          <Box
            ref={containerRef}
            sx={{
              position: 'relative',
              border: '2px solid',
              borderColor: 'neutral.300',
              borderRadius: 2,
              overflow: 'auto',
              width: '100%',
              height: '100%',
              backgroundColor: 'neutral.50',
              display: 'flex',
            }}
          >
            <img
              ref={imageRef}
              src={`data:image/png;base64,${inputImageBase64}`}
              alt="Background"
              style={{
                position: 'absolute',
                width: imageDimensions.width || '100%',
                height: imageDimensions.height || '100%',
                objectFit: 'contain',
                zIndex: 1,
                pointerEvents: 'none',
                // set opacity to 0 if maskRenderStyle is 'maskonly'
                opacity: maskRenderStyle === 'maskonly' ? 0 : 1,
              }}
            />
            {imageDimensions.width > 0 && imageDimensions.height > 0 && (
              <Box
                sx={{
                  zIndex: 2,
                  opacity: maskRenderStyle === 'red' ? 0.8 : 1,
                  filter: maskCSSFilter,
                }}
              >
                <ReactCanvasPaint
                  key={canvasKey}
                  width={imageDimensions.width}
                  height={imageDimensions.height}
                  colors={['#FFFFFF']}
                  showPalette={false}
                  strokeWidth={strokeSize}
                  drawMode={drawMode}
                  onDraw={handleCanvasDraw}
                />
              </Box>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              border: '2px dashed',
              borderColor: 'neutral.300',
              borderRadius: 2,
              padding: 4,
              textAlign: 'center',
              backgroundColor: 'neutral.50',
              aspectRatio: '1 / 1',
              maxHeight: '500px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Stack spacing={2} alignItems="center">
              <Typography level="body-lg" color="neutral">
                No image uploaded
              </Typography>
            </Stack>
          </Box>
        )}

        {/* Generated Images */}
        {generatedImages.length > 0 && (
          <Stack spacing={2} sx={{ height: '50%' }}>
            <Typography level="h4">Generated Results</Typography>

            {currentGenerationData?.generation_time && (
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Generated {generatedImages.length} image
                {generatedImages.length > 1 ? 's' : ''} in{' '}
                {currentGenerationData.generation_time.toFixed(2)}s
                {generatedImages.length > 1 && (
                  <span style={{ marginLeft: '16px' }}>
                    Image {currentImageIndex + 1} of {generatedImages.length}
                  </span>
                )}
              </Typography>
            )}

            <Box
              sx={{
                position: 'relative',
                border: '1px solid',
                borderColor: 'neutral.300',
                borderRadius: 2,
                overflow: 'hidden',
                aspectRatio: '1 / 1',
                maxHeight: '500px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {generatedImages.length > 1 && (
                <>
                  <IconButton
                    onClick={handlePreviousImage}
                    sx={{
                      position: 'absolute',
                      left: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 10,
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
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
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                      },
                    }}
                  >
                    <ChevronRight />
                  </IconButton>
                </>
              )}

              <img
                src={generatedImages[currentImageIndex]}
                alt={`Generated result ${currentImageIndex + 1}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </Box>

            {/* Thumbnail navigation for multiple images */}
            {generatedImages.length > 1 && (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: 1,
                  mt: 2,
                }}
              >
                {generatedImages.map((imageUrl: string, index: number) => (
                  <Box
                    key={imageUrl}
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
                      src={imageUrl}
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

            <Button
              onClick={handleSaveAllImages}
              variant="solid"
              color="primary"
            >
              Save All Images
            </Button>
          </Stack>
        )}
      </Stack>

      {/* History Image Selector Modal */}
      <HistoryImageSelector
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        onSelectImage={handleSelectFromHistory}
      />
    </Stack>
  );
}
