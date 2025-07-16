import React, { useState, useEffect, useRef } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Sheet,
  Stack,
  Typography,
  Box,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Checkbox,
  Tooltip,
  IconButton,
  CircularProgress,
  Alert,
  Select,
  Option,
} from '@mui/joy';
import {
  ChevronDown,
  ChevronUp,
  Info,
  ChevronLeft,
  ChevronRight,
  XIcon,
  ImageIcon,
  HistoryIcon,
  AlertTriangleIcon,
} from 'lucide-react';
import {
  getAPIFullPath,
  useServerStats,
} from 'renderer/lib/transformerlab-api-sdk';
import SimpleTextArea from 'renderer/components/Shared/SimpleTextArea';
import { useAnalytics } from '../../Shared/analytics/AnalyticsContext';
import History from './History';
import Inpainting from './Inpainting';
import HistoryImageSelector from './HistoryImageSelector';
import ControlNetModal from './ControlNetModal';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

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

const samplePrompts = [
  'ethereal fantasy concept art of a shimmering, bioluminescent forest at night, glowing mushrooms and mystical creatures, volumetric lighting, by Artgerm and WLOP, trending on Artstation, hyper-detailed, 8k.',
  'award-winning macro photograph of a mechanical bee covered in glistening dewdrops, intricate gears and filigree, on a reflective black surface, studio lighting, depth of field, ultra-detailed.',
  'cinematic wide-angle shot of a lone astronaut standing on the edge of a cosmic abyss, gazing at a swirling nebula, style of Denis Villeneuve, anamorphic lens flare, moody, atmospheric, breathtaking.',
  'an epic oil painting of a majestic ancient library inside a massive, hollowed-out tree, streams of light filtering through the canopy, scholars reading scrolls, style of Thomas Kinkade and Albert Bierstadt, dramatic lighting.',
  'photorealistic portrait of a fierce Viking warrior queen, intricate braided hair with silver clasps, determined expression, detailed leather and fur armor, Rembrandt lighting, sharp focus, dramatic.',
  'a bustling, vibrant cyberpunk street market in Neo-Tokyo at night, pouring rain, neon signs reflecting in puddles, diverse crowd of humans and cyborgs, style of Blade Runner 2049, cinematic, atmospheric, gritty.',
  'a surrealist masterpiece by Salvador Dalí featuring a melting grand piano on a serene, otherworldly beach, with a clockwork moon in a twilight sky, hyper-realistic, symbolic, dreamlike.',
  'full-body concept art of a celestial deity forged from constellations and stardust, flowing robes of cosmic gas, holding a miniature galaxy, powerful stance, fantasy, godlike, intricate detail.',
  'a Ukiyo-e style woodblock print of a tranquil Japanese garden, a majestic dragon made of water swirling in a koi pond, cherry blossoms drifting in the wind, serene, detailed, traditional.',
  'a beautifully detailed, isometric 3D render of a cozy, magical apothecary shop, shelves filled with glowing potions and ancient books, a cat sleeping by a fireplace, warm and inviting atmosphere.',
  "dynamic action shot of a knight in ornate, polished obsidian armor deflecting a dragon's fire breath with a glowing magical shield, sparks and embers flying, cinematic composition, motion blur, Lord of the Rings inspired.",
  'a stunningly beautiful Art Nouveau portrait of a woman with flowing hair that merges into intricate floral patterns, style of Alphonse Mucha, elegant lines, gold leaf accents, decorative.',
  'double exposure photograph combining a detailed silhouette of a wise old owl with a star-filled night sky and an ancient, gnarled tree, conceptual, moody, artistic.',
  'award-winning architectural photograph of a futuristic sustainable city with towering vertical forests and sleek, bio-luminescent sky-bridges, harmonious, golden hour, ultra-sharp, professional.',
  'a gritty, emotional close-up portrait of an old, weathered sailor looking out to sea, deep wrinkles, piercing blue eyes, stormy background, shot on Kodak Portra 400 film, character study.',
  'an abstract explosion of color and texture, thick impasto oil paint, dynamic swirling motion, vibrant palette of crimson and gold, evoking passion and energy, fine art.',
  'steampunk-inspired submarine navigating a deep-sea trench, encountering giant, glowing jellyfish, intricate brass and copper details, portholes revealing a detailed interior, underwater, mysterious.',
  'a minimalist, ink wash painting (sumi-e) of a single mountain peak rising above a sea of fog, a small red sun in the background, elegant brush strokes, sense of peace and scale.',
  'a photorealistic image of a futuristic Formula 1 car hovering on a magnetic track through a desert canyon at sunset, heat haze, lens flare, high speed, dynamic motion, professional automotive photography.',
  'a whimsical and highly detailed illustration of a miniature world inside a glass terrarium, tiny people tending to giant flowers, a small waterfall, magical realism, storybook style.',
];

export default function Diffusion() {
  const { experimentInfo } = useExperimentInfo();
  const analytics = useAnalytics();

  const initialModel = experimentInfo?.config?.foundation || '';
  const adaptor = experimentInfo?.config?.adaptor || '';
  const [model, setModel] = useState(initialModel);

  // Get server stats for machine type detection
  const { server } = useServerStats();

  // Generate tab state
  const [prompt, setPrompt] = useState(
    samplePrompts[Math.floor(Math.random() * samplePrompts.length)],
  );
  const [numSteps, setNumSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState('');
  const [upscale, setUpscale] = useState(false);
  const [upscaleFactor, setUpscaleFactor] = useState(4);

  // Advanced settings for Generate tab
  const [negativePrompt, setNegativePrompt] = useState('');
  const [eta, setEta] = useState('');
  const [clipSkip, setClipSkip] = useState('');
  const [guidanceRescale, setGuidanceRescale] = useState('');
  const [imageWidth, setImageWidth] = useState('');
  const [imageHeight, setImageHeight] = useState('');
  const [numImages, setNumImages] = useState(1);
  const [scheduler, setScheduler] = useState('default');
  const [processType, setProcessType] = useState(null);

  // Image-to-image settings for Generate tab
  const [inputImageBase64, setInputImageBase64] = useState('');
  const [strength, setStrength] = useState(0.8);

  // Inpainting settings for Generate tab
  const [maskImageBase64, setMaskImageBase64] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [inpaintingMode, setInpaintingMode] = useState(false);

  // Separate state for Inpainting tab
  const [inpaintingPrompt, setInpaintingPrompt] = useState(
    'An astronaut floating in space',
  );
  const [inpaintingNumSteps, setInpaintingNumSteps] = useState(30);
  const [inpaintingGuidanceScale, setInpaintingGuidanceScale] = useState(7.5);
  const [inpaintingSeed, setInpaintingSeed] = useState('');
  const [inpaintingNegativePrompt, setInpaintingNegativePrompt] = useState('');
  const [inpaintingStrength, setInpaintingStrength] = useState(0.8);
  const [inpaintingInputImageBase64, setInpaintingInputImageBase64] =
    useState('');
  const [inpaintingMaskImageBase64, setInpaintingMaskImageBase64] =
    useState('');
  const [inpaintingImageWidth, setInpaintingImageWidth] = useState('');
  const [inpaintingImageHeight, setInpaintingImageHeight] = useState('');
  const [inpaintingNumImages, setInpaintingNumImages] = useState(1);

  // Separate state for generated images on each tab
  const [generateImages, setGenerateImages] = useState<string[]>([]);
  const [inpaintingImages, setInpaintingImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentGenerationData, setCurrentGenerationData] = useState<any>(null);
  const [isStableDiffusion, setIsStableDiffusion] = useState<boolean | null>(
    null,
  );
  const [isImg2ImgEligible, setIsImg2ImgEligible] = useState<boolean | null>(
    null,
  );
  const [isInpaintingEligible, setIsInpaintingEligible] = useState<
    boolean | null
  >(null);
  const [controlNetType, setControlNetType] = useState('off');
  const [controlnetModalOpen, setControlnetModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('generate');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Intermediate image generation state
  const showIntermediateImages = true; // Always show intermediate images
  const [currentIntermediateImage, setCurrentIntermediateImage] = useState<
    string | null
  >(null);
  // const [currentStep, setCurrentStep] = useState(0);
  const [isPolling, setIsPolling] = useState(false);

  // Helper functions to get the appropriate images based on active tab
  const getCurrentImages = () => {
    return activeTab === 'inpainting' ? inpaintingImages : generateImages;
  };

  const setCurrentImages = (images: string[]) => {
    if (activeTab === 'inpainting') {
      setInpaintingImages(images);
    } else {
      setGenerateImages(images);
    }
  };

  // Helper function to detect if machine is Apple Silicon
  const isAppleSilicon = () => {
    return server?.device_type === 'apple_silicon';
  };

  // Update model when experimentInfo changes
  useEffect(() => {
    const newModel = experimentInfo?.config?.foundation;
    if (newModel !== model) {
      setModel(newModel);
      // Reset isStableDiffusion when model changes
      setIsStableDiffusion(null);
      // Clear input image when model changes
      setInputImageBase64('');
      // Clear mask image when model changes
      setMaskImageBase64('');
      // Reset img2img eligibility when model changes
      setIsImg2ImgEligible(null);
      // Reset inpainting eligibility when model changes
      setIsInpaintingEligible(null);
      // Reset inpainting mode when model changes
      setInpaintingMode(false);
      // Reset ControlNet settings
      setControlNetType('off');
      setProcessType(null);
    }
  }, [experimentInfo?.config?.foundation, model]);

  // Check if model is eligible for img2img
  const checkImg2ImgEligibility = async () => {
    setIsImg2ImgEligible(null);
    try {
      const response = await fetch(
        getAPIFullPath('diffusion', ['checkValidDiffusion'], {}),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, is_img2img: true }),
        },
      );
      const data = await response.json();
      setIsImg2ImgEligible(data.is_valid_diffusion_model);
    } catch (e) {
      setIsImg2ImgEligible(false);
    }
  };

  // Check if model is eligible for inpainting
  const checkInpaintingEligibility = async () => {
    setIsInpaintingEligible(null);
    try {
      const response = await fetch(
        getAPIFullPath('diffusion', ['checkValidDiffusion'], {}),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, is_inpainting: true }),
        },
      );
      const data = await response.json();
      setIsInpaintingEligible(data.is_valid_diffusion_model);
    } catch (e) {
      setIsInpaintingEligible(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // Remove the data URL prefix to get just the base64 string
        const base64String = result.split(',')[1];
        setInputImageBase64(base64String);
        // Check if model supports img2img when image is uploaded
        checkImg2ImgEligibility();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setInputImageBase64('');
    setIsImg2ImgEligible(null);
    // Also clear mask and inpainting mode when removing reference image
    setMaskImageBase64('');
    setInpaintingMode(false);
    setIsInpaintingEligible(null);
    setControlNetType('off');
    setProcessType(null);
  };

  const handleSelectFromHistory = (imageBase64: string) => {
    setInputImageBase64(imageBase64);
    setHistoryModalOpen(false);
    // Check if model supports img2img when image is selected from history
    checkImg2ImgEligibility();
  };

  // const handleMaskUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = event.target.files?.[0];
  //   if (file) {
  //     const reader = new FileReader();
  //     reader.onload = (e) => {
  //       const result = e.target?.result as string;
  //       // Remove the data URL prefix to get just the base64 string
  //       const base64String = result.split(',')[1];
  //       setMaskImageBase64(base64String);
  //       // Enable inpainting mode when mask is uploaded
  //       setInpaintingMode(true);
  //       // Check if model supports inpainting when mask is uploaded
  //       checkInpaintingEligibility();
  //     };
  //     reader.readAsDataURL(file);
  //   }
  // };

  // const handleRemoveMask = () => {
  //   setMaskImageBase64('');
  //   setInpaintingMode(false);
  //   setIsInpaintingEligible(null);
  // };

  // Intermediate image generation helper functions
  const getGenerationId = async (): Promise<string | null> => {
    try {
      const response = await fetch(
        getAPIFullPath('diffusion', ['generateId'], {}),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const data = await response.json();
      return data.generation_id;
    } catch (e) {
      setError('Failed to get generation ID');
      return null;
    }
  };

  // Ref to store polling cleanup function
  const pollingCleanupRef = useRef<(() => void) | null>(null);

  // Function to start polling for intermediate images
  const startPollingForIntermediateImages = (
    genId: string,
    totalSteps: number,
  ) => {
    setIsPolling(true);
    setCurrentIntermediateImage(null);
    // setCurrentStep(0);

    let isActive = true; // flag to control active polling
    let lastImageUrl: string | null = null;
    const pollInterval = 1000; // Poll every second
    let pollTimeoutId: number;

    const poll = async () => {
      if (!isActive) return; // stop if no longer active
      // Poll for the latest step image (backend overwrites the same step.png file)
      try {
        const baseUrl = getAPIFullPath('diffusion', ['getImage'], {
          imageId: genId,
          index: 0,
        });
        const response = await fetch(`${baseUrl}&step=true`); // Add timestamp to prevent caching

        if (response.ok) {
          const blob = await response.blob();
          const imageUrl = URL.createObjectURL(blob);

          if (imageUrl !== lastImageUrl) {
            if (lastImageUrl) {
              URL.revokeObjectURL(lastImageUrl);
            }

            setCurrentIntermediateImage(imageUrl);
            lastImageUrl = imageUrl;
            // setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
          }
        } else if (response.status === 404) {
          // Don't update anything, just continue polling - image might not be ready yet
        }
      } catch (e) {
        // Continue polling even if there's an error
      }

      // Schedule next poll only if still active
      if (isActive) {
        pollTimeoutId = window.setTimeout(poll, pollInterval);
      }
    };

    // Start polling
    pollTimeoutId = window.setTimeout(poll, pollInterval);

    // Return cleanup function to stop further polls
    return () => {
      isActive = false;
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
      }
      setIsPolling(false);
      if (lastImageUrl) {
        URL.revokeObjectURL(lastImageUrl);
      }
    };
  };

  // Stop polling when loading becomes false
  useEffect(() => {
    if (!loading && pollingCleanupRef.current) {
      pollingCleanupRef.current();
      pollingCleanupRef.current = null;
    }
  }, [loading]);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setCurrentImages([]);
    setCurrentGenerationData(null);
    setCurrentImageIndex(0); // Reset to first image

    // Reset intermediate image state
    setCurrentIntermediateImage(null);
    // setCurrentStep(0);

    try {
      // First, get a generation ID to enable intermediate image polling
      const genId = await getGenerationId();
      if (!genId) {
        setError('Failed to initialize generation');
        return;
      }

      analytics.track('Diffusion Generated', {
        model,
      });

      // Build the request body with basic parameters
      const requestBody: any = {
        model,
        adaptor,
        prompt,
        num_inference_steps: Number(numSteps),
        guidance_scale: Number(guidanceScale),
        seed: seed ? Number(seed) : -1, // -1 means random seed
        upscale,
        upscale_factor: Number(upscaleFactor),
        num_images: Number(numImages),
        generation_id: genId, // Include the generation ID
        is_controlnet: controlNetType,
        scheduler, // include scheduler
      };

      // Add image-to-image parameters if an input image is provided
      if (inputImageBase64) {
        requestBody.input_image = inputImageBase64;
        requestBody.strength = Number(strength);

        // Check if this is inpainting (has both image and mask)
        if (maskImageBase64) {
          requestBody.mask_image = maskImageBase64;
          requestBody.is_inpainting = true;
        } else {
          requestBody.is_img2img = true;
        }
      }

      // Add advanced parameters only if they are specified
      if (negativePrompt.trim()) {
        requestBody.negative_prompt = negativePrompt;
      }
      if (eta && Number(eta) !== 0) {
        requestBody.eta = Number(eta);
      }
      if (clipSkip && Number(clipSkip) !== 0) {
        requestBody.clip_skip = Number(clipSkip);
      }
      if (guidanceRescale && Number(guidanceRescale) !== 0) {
        requestBody.guidance_rescale = Number(guidanceRescale);
      }
      if (imageWidth && Number(imageWidth) !== 0) {
        requestBody.width = Number(imageWidth);
      }
      if (imageHeight && Number(imageHeight) !== 0) {
        requestBody.height = Number(imageHeight);
      }
      if (controlNetType !== 'off' && processType) {
        requestBody.process_type = processType;
      }
      // Start polling for intermediate images BEFORE making the generation request
      pollingCleanupRef.current = startPollingForIntermediateImages(
        genId,
        Number(numSteps),
      );

      const response = await fetch(
        getAPIFullPath('diffusion', ['generate'], {}),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      );
      const data = await response.json();

      if (data.error_code !== 0) {
        setError(data.detail);
        // Stop polling on error
        if (pollingCleanupRef.current) pollingCleanupRef.current();
        pollingCleanupRef.current = null;
      } else {
        // Fetch all generated images
        const imageUrls: string[] = [];
        for (let i = 0; i < data.num_images; i++) {
          const imageUrl = getAPIFullPath('diffusion', ['getImage'], {
            imageId: data.id,
            index: i,
          });
          imageUrls.push(imageUrl);
        }
        setCurrentImages(imageUrls);
        setCurrentGenerationData(data);

        // Stop polling when generation is complete
        if (pollingCleanupRef.current) pollingCleanupRef.current();
        pollingCleanupRef.current = null;
      }
    } catch (e) {
      setError('Failed to generate image');
      setIsPolling(false);
      // Stop polling on error
      if (pollingCleanupRef.current) pollingCleanupRef.current();
      pollingCleanupRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const handleInpaintingGenerate = async () => {
    setLoading(true);
    setError('');
    setInpaintingImages([]);
    setCurrentGenerationData(null);
    setCurrentImageIndex(0); // Reset to first image
    try {
      analytics.track('Inpainting Generated', {
        model,
      });
      // Build the request body with inpainting parameters
      const requestBody: any = {
        model,
        adaptor,
        prompt: inpaintingPrompt,
        num_inference_steps: Number(inpaintingNumSteps),
        guidance_scale: Number(inpaintingGuidanceScale),
        seed: inpaintingSeed ? Number(inpaintingSeed) : -1, // -1 means random seed
        upscale,
        upscale_factor: Number(upscaleFactor),
        num_images: Number(inpaintingNumImages) || 1, // Default to 1 if not specified
      };

      // Add inpainting parameters
      if (inpaintingInputImageBase64) {
        requestBody.input_image = inpaintingInputImageBase64;
        requestBody.strength = Number(inpaintingStrength);

        // Inpainting always requires a mask
        if (inpaintingMaskImageBase64) {
          requestBody.mask_image = inpaintingMaskImageBase64;
          requestBody.is_inpainting = true;
        } else {
          // If no mask, treat as img2img
          requestBody.is_img2img = true;
        }
      }

      // Add negative prompt if specified
      if (inpaintingNegativePrompt.trim()) {
        requestBody.negative_prompt = inpaintingNegativePrompt;
      }

      // Add advanced parameters only if they are specified
      if (inpaintingImageWidth && Number(inpaintingImageWidth) !== 0) {
        requestBody.width = Number(inpaintingImageWidth);
      }
      if (inpaintingImageHeight && Number(inpaintingImageHeight) !== 0) {
        requestBody.height = Number(inpaintingImageHeight);
      }

      const response = await fetch(
        getAPIFullPath('diffusion', ['generate'], {}),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      );
      const data = await response.json();
      if (data.error_code !== 0) {
        setError(data.detail || 'Error generating inpainting image');
      } else {
        // Fetch all generated images
        const imageUrls: string[] = [];
        for (let i = 0; i < data.num_images; i++) {
          const imageUrl = getAPIFullPath('diffusion', ['getImage'], {
            imageId: data.id,
            index: i,
          });
          imageUrls.push(imageUrl);
        }
        setInpaintingImages(imageUrls);
        setCurrentGenerationData(data);
      }
    } catch (e) {
      setError('Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAllImages = async () => {
    if (!currentGenerationData?.id) {
      setError('No generation data available');
      return;
    }

    try {
      // Create a link to the new endpoint that returns a zip file
      const link = document.createElement('a');
      link.href = getAPIFullPath('diffusion', ['getAllImages'], {
        imageId: currentGenerationData.id,
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
      setError('Failed to save images');
    }
  };

  // Navigation functions for multiple images
  const handlePreviousImage = () => {
    const currentImages = getCurrentImages();
    setCurrentImageIndex((prev) =>
      prev > 0 ? prev - 1 : currentImages.length - 1,
    );
  };

  const handleNextImage = () => {
    const currentImages = getCurrentImages();
    setCurrentImageIndex((prev) =>
      prev < currentImages.length - 1 ? prev + 1 : 0,
    );
  };

  // Check if model is eligible for diffusion
  const checkValidDiffusion = async () => {
    setIsStableDiffusion(null);
    try {
      const response = await fetch(
        getAPIFullPath('diffusion', ['checkValidDiffusion'], {}),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model }),
        },
      );
      const data = await response.json();
      setIsStableDiffusion(data.is_valid_diffusion_model);
    } catch (e) {
      setIsStableDiffusion(false);
    }
  };

  // Check on mount and when model changes
  useEffect(() => {
    checkValidDiffusion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentInfo?.config?.foundation]);

  // Cleanup effect to stop polling when component unmounts
  useEffect(() => {
    return () => {
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current();
        pollingCleanupRef.current = null;
      }
    };
  }, []);

  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
      }}
    >
      <Tabs
        value={activeTab}
        onChange={(event, newValue) => {
          setActiveTab(newValue as string);
          setCurrentImageIndex(0); // Reset image index when switching tabs

          // Check inpainting eligibility when switching to inpainting tab
          if (newValue === 'inpainting') {
            checkInpaintingEligibility();
          }
        }}
        id="diffusion-tabs"
        sx={{ height: '100%', overflow: 'hidden' }}
      >
        <TabList>
          <Tab value="generate">Generate Image</Tab>
          <Tab value="inpainting">Inpainting</Tab>
          <Tab value="history">Image History</Tab>
        </TabList>

        <TabPanel
          value="generate"
          sx={{
            p: 0,
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <Stack
            flexDirection="row"
            display="flex"
            sx={{
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
            gap={2}
          >
            <Stack
              gap={1}
              flex={1}
              flexDirection="column"
              sx={{
                height: '100%',
                overflowX: 'hidden',
                overflowY: 'hidden',
                pt: 2,
                pb: 1,
              }}
            >
              <Stack gap={2} sx={{ overflowY: 'auto', pr: 1, mb: 1 }}>
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
                <FormControl>
                  <LabelWithTooltip tooltip="Describe the image you want to generate. Be specific and detailed for better results.">
                    Prompt
                  </LabelWithTooltip>
                  <SimpleTextArea
                    value={prompt}
                    setValue={setPrompt}
                    rows={4}
                  />
                </FormControl>

                {/* Image Upload - Optional Reference Image */}
                <FormControl>
                  <LabelWithTooltip tooltip="Optional: Upload a reference image to modify instead of generating from scratch. The AI will use this as a starting point and modify it according to your prompt.">
                    Reference Image (Optional)
                  </LabelWithTooltip>
                  {!inputImageBase64 ? (
                    <Box>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                        id="reference-image-upload"
                      />
                      <Stack direction="row" spacing={1}>
                        <Button
                          component="label"
                          htmlFor="reference-image-upload"
                          variant="outlined"
                          size="sm"
                          startDecorator={<ImageIcon size={16} />}
                        >
                          Upload Reference Image
                        </Button>
                        <Button
                          variant="outlined"
                          size="sm"
                          startDecorator={<HistoryIcon size={16} />}
                          onClick={() => setHistoryModalOpen(true)}
                        >
                          From History
                        </Button>
                      </Stack>
                      <Typography
                        level="body-xs"
                        sx={{ mt: 0.5, color: 'text.tertiary' }}
                      >
                        Upload an image to use as a starting point for
                        generation
                      </Typography>
                    </Box>
                  ) : (
                    <Stack gap={1}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 0.5,
                        }}
                      >
                        <img
                          src={`data:image/png;base64,${inputImageBase64}`}
                          alt="Reference"
                          style={{
                            maxWidth: '100%',
                            maxHeight: 120,
                            borderRadius: 4,
                            objectFit: 'contain',
                          }}
                        />
                        <Button
                          size="sm"
                          variant="soft"
                          color="danger"
                          onClick={handleRemoveImage}
                          sx={{
                            minHeight: 'unset',
                            p: 0.5,
                          }}
                        >
                          <XIcon size={16} />
                        </Button>
                      </Box>
                      <FormControl sx={{ minWidth: 120 }}>
                        <LabelWithTooltip tooltip="Controls how much the AI modifies the reference image. Lower values (0.1-0.5) make subtle changes, higher values (0.6-1.0) make dramatic changes.">
                          Strength
                        </LabelWithTooltip>
                        <Input
                          type="number"
                          value={strength}
                          onChange={(e) => setStrength(Number(e.target.value))}
                          slotProps={{
                            input: {
                              step: 0.1,
                              min: 0.1,
                              max: 1.0,
                            },
                          }}
                          sx={{ width: 100 }}
                        />
                      </FormControl>
                      {inputImageBase64 && (
                        <Stack direction="row" spacing={2} alignItems="center">
                          <FormControl sx={{ minWidth: 160 }}>
                            <LabelWithTooltip tooltip="Manage and select a ControlNet to guide image generation.">
                              ControlNet
                            </LabelWithTooltip>
                            <Button
                              size="sm"
                              variant="outlined"
                              onClick={() => setControlnetModalOpen(true)}
                            >
                              {controlNetType === 'off'
                                ? 'Select ControlNet'
                                : controlNetType}
                            </Button>
                          </FormControl>

                          {controlNetType !== 'off' && (
                            <FormControl sx={{ minWidth: 160 }}>
                              <LabelWithTooltip tooltip="Select how to process the reference image for the ControlNet model.">
                                Process Type
                              </LabelWithTooltip>
                              <Select
                                value={processType}
                                onChange={(_, value) => setProcessType(value)}
                                style={{
                                  width: 150,
                                  height: 32,
                                  borderRadius: 4,
                                  border: '1px solid #ccc',
                                  padding: '4px 8px',
                                  fontSize: '14px',
                                }}
                              >
                                <Option value="">Select Type</Option>
                                <Option value="Canny">Canny</Option>
                                <Option value="OpenPose">OpenPose</Option>
                                <Option value="Zoe">Zoe</Option>
                                <Option value="Depth">Depth</Option>
                                <Option value="HED">HED</Option>
                                <Option value="Scribble">Scribble</Option>
                                <Option value="SoftEdge">SoftEdge</Option>
                                <Option value="Seg">Seg</Option>
                                <Option value="Normal">Normal</Option>
                                <Option value="LineArt">LineArt</Option>
                              </Select>
                            </FormControl>
                          )}
                        </Stack>
                      )}
                    </Stack>
                  )}
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
                  <FormControl
                    sx={{ flex: 1, justifyContent: 'space-between' }}
                  >
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
                  <FormControl
                    sx={{
                      flex: 1,
                      justifyContent: 'space-between',
                    }}
                  >
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
                  <FormControl
                    sx={{
                      flex: 1,
                      justifyContent: 'space-between',
                    }}
                  >
                    <LabelWithTooltip tooltip="Random seed for reproducibility. Leave empty for random generation, or use a specific number to generate the same image repeatedly.">
                      Seed (optional)
                    </LabelWithTooltip>
                    <Input
                      type="number"
                      value={seed}
                      sx={{ width: 100 }}
                      onChange={(e) => setSeed(e.target.value)}
                    />
                  </FormControl>
                  <FormControl
                    sx={{
                      flex: 1,
                      justifyContent: 'space-between',
                    }}
                  >
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
                  <FormControl
                    sx={{
                      flex: 1,
                      justifyContent: 'space-between',
                    }}
                  >
                    <LabelWithTooltip tooltip="Select the sampling scheduler used to generate the image. Different schedulers can produce slightly different results in terms of quality and style.">
                      Scheduler
                    </LabelWithTooltip>
                    <Select
                      value={scheduler}
                      onChange={(_, value) => setScheduler(value)}
                      style={{
                        width: 150,
                        height: 32,
                        borderRadius: 4,
                        border: '1px solid #ccc',
                        padding: '4px 8px',
                        fontSize: '14px',
                      }}
                    >
                      <Option value="default">Default</Option>
                      <Option value="EulerDiscreteScheduler">
                        EulerDiscreteScheduler
                      </Option>
                      <Option value="LMSDiscreteScheduler">
                        LMSDiscreteScheduler
                      </Option>
                      <Option value="EulerAncestralDiscreteScheduler">
                        EulerAncestralDiscreteScheduler
                      </Option>
                      <Option value="DPMSolverMultistepScheduler">
                        DPMSolverMultistepScheduler
                      </Option>
                    </Select>
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
                      showAdvanced ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )
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
                          placeholder="Describe what you don't want in the image"
                        />
                      </FormControl>
                      <Stack
                        gap={1}
                        sx={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                        }}
                      >
                        <FormControl
                          sx={{ flex: 1, justifyContent: 'space-between' }}
                        >
                          <LabelWithTooltip tooltip="Controls the amount of noise in the denoising process. Higher values add more randomness while lower values make the process more deterministic. Leave at 0.0 for default behavior.">
                            ETA
                          </LabelWithTooltip>
                          <Input
                            type="number"
                            value={eta}
                            sx={{ width: 100 }}
                            onChange={(e) => setEta(e.target.value)}
                            placeholder="0.0"
                            slotProps={{
                              input: {
                                step: 0.1,
                                min: 0,
                                max: 1,
                              },
                            }}
                          />
                        </FormControl>
                        <FormControl
                          sx={{ flex: 1, justifyContent: 'space-between' }}
                        >
                          <LabelWithTooltip tooltip="Number of CLIP text encoder layers to skip. Higher values may result in more artistic or abstract outputs. Set to 0 for default behavior.">
                            CLIP Skip
                          </LabelWithTooltip>
                          <Input
                            type="number"
                            value={clipSkip}
                            sx={{ width: 100 }}
                            onChange={(e) => setClipSkip(e.target.value)}
                            placeholder="0"
                            slotProps={{
                              input: {
                                step: 1,
                                min: 0,
                                max: 12,
                              },
                            }}
                          />
                        </FormControl>
                        <FormControl
                          sx={{ flex: 1, justifyContent: 'space-between' }}
                        >
                          <LabelWithTooltip tooltip="Rescales the guidance scale to prevent over-saturation. Values between 0.0-1.0 can help balance prompt adherence with image quality. Leave at 0.0 for default behavior.">
                            Guidance Rescale
                          </LabelWithTooltip>
                          <Input
                            type="number"
                            value={guidanceRescale}
                            sx={{ width: 100 }}
                            onChange={(e) => setGuidanceRescale(e.target.value)}
                            placeholder="0.0"
                            slotProps={{
                              input: {
                                step: 0.1,
                                min: 0,
                                max: 1,
                              },
                            }}
                          />
                        </FormControl>
                      </Stack>
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
                                max: 2048,
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
                                max: 2048,
                              },
                            }}
                          />
                        </FormControl>
                      </Stack>
                      <Stack
                        gap={1}
                        sx={{
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <Tooltip
                          title="Enhance the generated image resolution by upscaling it 2x using a upscaling model. This improves detail and clarity, especially for low-resolution outputs."
                          arrow
                          placement="top"
                          sx={{ maxWidth: 200 }}
                          variant="soft"
                        >
                          <Checkbox
                            checked={upscale}
                            onChange={(e) => {
                              setUpscale(e.target.checked);
                              if (e.target.checked) {
                                setUpscaleFactor(2);
                              }
                            }}
                            label="Upscale image (2x)"
                          />
                        </Tooltip>
                      </Stack>
                    </Stack>
                  )}
                </Sheet>
              </Stack>

              <Button
                onClick={handleGenerate}
                disabled={loading || isStableDiffusion === false}
                color="primary"
                size="lg"
                startDecorator={loading && <CircularProgress />}
              >
                {loading && 'Generating'}
                {!loading && inputImageBase64 && 'Generate from Image'}
                {!loading && !inputImageBase64 && 'Generate Image'}
              </Button>
            </Stack>
            <Box
              flex={2}
              sx={{
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                paddingBottom: 1,
                paddingRight: 1,
              }}
            >
              {error && <Typography color="danger">{error}</Typography>}
              {isStableDiffusion === false && (
                <Typography color="danger">
                  This model is not eligible for diffusion.
                </Typography>
              )}
              {isAppleSilicon() && (
                <Alert
                  color="danger"
                  variant="soft"
                  startDecorator={<AlertTriangleIcon />}
                  sx={{
                    mt: 1,
                    maxWidth: '100%',
                    alignSelf: 'flex-start',
                  }}
                >
                  <Typography level="body-sm">
                    <strong>
                      MLX is not currently supported for Diffusion.
                    </strong>{' '}
                    Any diffusion operations would use the CPU, which may be
                    significantly slower.
                  </Typography>
                </Alert>
              )}
              {inputImageBase64 &&
                isImg2ImgEligible === false &&
                controlNetType === 'off' && (
                  <Typography color="danger">
                    This model does not support direct image-to-image
                    generation. To use a reference image, please enable a
                    ControlNet.
                  </Typography>
                )}

              {getCurrentImages().length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    mt: 1,
                    width: '100%',
                    height: '100%',
                    overflow: 'auto',
                  }}
                >
                  {currentGenerationData?.generation_time && (
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Generated {getCurrentImages().length} image
                      {getCurrentImages().length > 1 ? 's' : ''} in{' '}
                      {currentGenerationData.generation_time.toFixed(2)}s
                      {getCurrentImages().length > 1 && (
                        <span style={{ marginLeft: '16px' }}>
                          {'Image '}
                          {currentImageIndex + 1}
                          {' of '}
                          {getCurrentImages().length}
                        </span>
                      )}
                    </Typography>
                  )}

                  {/* Main image display with navigation */}
                  <Box
                    sx={{
                      position: 'relative',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      width: '100%',
                      flex: 1,
                      minHeight: 0,
                    }}
                  >
                    {/* Navigation buttons for multiple images */}
                    {getCurrentImages().length > 1 && (
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

                    {/* Current image */}
                    <img
                      src={getCurrentImages()[currentImageIndex]}
                      alt={`Generated ${currentImageIndex + 1}`}
                      style={{
                        borderRadius: 8,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  </Box>

                  {/* Thumbnail navigation for multiple images */}
                  {getCurrentImages().length > 1 && (
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
                      {getCurrentImages().map(
                        (imageUrl: string, index: number) => (
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
                        ),
                      )}
                    </Stack>
                  )}

                  {/* Single Save All Images button */}
                  <Button
                    onClick={handleSaveAllImages}
                    color="primary"
                    variant="solid"
                    size="md"
                    sx={{ mt: 2 }}
                  >
                    {getCurrentImages().length > 1
                      ? 'Save All Images'
                      : 'Save Image'}
                  </Button>
                </Box>
              )}

              {/* Intermediate image display during generation */}
              {showIntermediateImages && (loading || isPolling) && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    mt: 1,
                    width: '100%',
                  }}
                >
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Generating...
                  </Typography>

                  {/* Show current intermediate image if available */}
                  {currentIntermediateImage && (
                    <Box
                      sx={{
                        position: 'relative',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '90%',
                      }}
                    >
                      <img
                        src={currentIntermediateImage || ''}
                        alt=""
                        style={{
                          borderRadius: 8,
                          width: '90%',
                          objectFit: 'contain',
                          display: 'block',
                        }}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Stack>
        </TabPanel>
        <TabPanel
          value="history"
          sx={{
            p: 0,
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <Sheet sx={{ height: '100%', overflowY: 'auto' }}>
            <History />
          </Sheet>
        </TabPanel>
        <TabPanel
          value="inpainting"
          sx={{
            p: 0,
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <Sheet sx={{ height: '100%', overflowY: 'auto' }}>
            <Inpainting
              model={model}
              adaptor={adaptor}
              prompt={inpaintingPrompt}
              setPrompt={setInpaintingPrompt}
              inputImageBase64={inpaintingInputImageBase64}
              setInputImageBase64={setInpaintingInputImageBase64}
              setMaskImageBase64={setInpaintingMaskImageBase64}
              strength={inpaintingStrength}
              setStrength={setInpaintingStrength}
              numSteps={inpaintingNumSteps}
              setNumSteps={setInpaintingNumSteps}
              guidanceScale={inpaintingGuidanceScale}
              setGuidanceScale={setInpaintingGuidanceScale}
              seed={inpaintingSeed}
              setSeed={setInpaintingSeed}
              negativePrompt={inpaintingNegativePrompt}
              setNegativePrompt={setInpaintingNegativePrompt}
              onGenerate={handleInpaintingGenerate}
              loading={loading}
              error={error}
              generatedImages={inpaintingImages}
              currentImageIndex={currentImageIndex}
              setCurrentImageIndex={setCurrentImageIndex}
              handlePreviousImage={handlePreviousImage}
              handleNextImage={handleNextImage}
              handleSaveAllImages={handleSaveAllImages}
              currentGenerationData={currentGenerationData}
              isInpaintingEligible={isInpaintingEligible}
              imageWidth={inpaintingImageWidth}
              setImageWidth={setInpaintingImageWidth}
              imageHeight={inpaintingImageHeight}
              setImageHeight={setInpaintingImageHeight}
              numImages={inpaintingNumImages}
              setNumImages={setInpaintingNumImages}
            />
          </Sheet>
        </TabPanel>
      </Tabs>

      {/* History Image Selector Modal */}
      <HistoryImageSelector
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        onSelectImage={handleSelectFromHistory}
      />
      <ControlNetModal
        open={controlnetModalOpen}
        onClose={() => setControlnetModalOpen(false)}
        selectedControlnet={controlNetType}
        onSelect={(selected: string) => {
          setControlNetType(selected);
          if (selected === 'off') setProcessType(null);
        }}
      />
    </Sheet>
  );
}
