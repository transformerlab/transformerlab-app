import { useState, useEffect } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Sheet,
  Stack,
  Typography,
  Textarea,
  Box,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Checkbox,
} from '@mui/joy';
import { Endpoints } from 'renderer/lib/api-client/endpoints';
import History from './History';

type DiffusionProps = {
  experimentInfo?: any;
};

export default function Diffusion({ experimentInfo }: DiffusionProps) {
  const initialModel =
    experimentInfo?.config?.foundation || 'stabilityai/stable-diffusion-2-1';
  const adaptor = experimentInfo?.config?.adaptor || '';
  const [model] = useState(initialModel);
  const [prompt, setPrompt] = useState('An astronaut floating in space');
  const [numSteps, setNumSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState('');
  const [upscale, setUpscale] = useState(false);
  const [upscaleFactor, setUpscaleFactor] = useState(4);

  // Advanced settings
  const [negativePrompt, setNegativePrompt] = useState('');
  const [eta, setEta] = useState('');
  const [clipSkip, setClipSkip] = useState('');
  const [guidanceRescale, setGuidanceRescale] = useState('');
  const [imageWidth, setImageWidth] = useState('');
  const [imageHeight, setImageHeight] = useState('');

  const [imageBase64, setImageBase64] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isStableDiffusion, setIsStableDiffusion] = useState<boolean | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState('generate');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setImageBase64('');
    try {
      // Build the request body with basic parameters
      const requestBody: any = {
        model,
        adaptor,
        prompt,
        num_inference_steps: Number(numSteps),
        guidance_scale: Number(guidanceScale),
        seed: seed ? Number(seed) : 42,
        upscale,
        upscale_factor: Number(upscaleFactor),
      };

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

      const response = await fetch(Endpoints.Diffusion.Generate(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();
      if (data.error_code !== 0) {
        setError('Error generating image');
      } else {
        setImageBase64(data.image_base64);
      }
    } catch (e) {
      setError('Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveImage = () => {
    if (!imageBase64) return;

    // Convert base64 to blob
    const byteCharacters = atob(imageBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Generate filename with timestamp and truncated prompt
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    link.download = `diffusion_${timestamp}.png`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Check if model is eligible for diffusion
  const checkStableDiffusion = async () => {
    setIsStableDiffusion(null);
    try {
      const response = await fetch(Endpoints.Diffusion.CheckStableDiffusion(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const data = await response.json();
      setIsStableDiffusion(data.is_stable_diffusion);
    } catch (e) {
      setIsStableDiffusion(false);
    }
  };

  // Check on mount and when model changes
  useEffect(() => {
    checkStableDiffusion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

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
      <Typography level="h2" mb={2}>
        Diffusion Image Generation
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(event, newValue) => setActiveTab(newValue as string)}
        id="diffusion-tabs"
        sx={{ height: '100%', overflow: 'hidden' }}
      >
        <TabList>
          <Tab value="generate">Generate</Tab>
          <Tab value="history">History</Tab>
        </TabList>

        <TabPanel value="generate" sx={{ p: 0, height: 'calc(100vh - 200px)' }}>
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
              gap={2}
              flex={1}
              flexDirection="column"
              sx={{
                height: '100%',
                overflowX: 'hidden',
                overflowY: 'auto',
              }}
            >
              <Stack gap={2}>
                <FormControl>
                  <FormLabel>Model</FormLabel>
                  <Input
                    value={model}
                    disabled
                    readOnly
                    placeholder="Model name or path"
                  />
                </FormControl>
                {adaptor && (
                  <FormControl>
                    <FormLabel>Adaptor</FormLabel>
                    <Input
                      value={adaptor}
                      disabled
                      readOnly
                      placeholder="Adaptor name or path"
                    />
                  </FormControl>
                )}
                <FormControl>
                  <FormLabel>Prompt</FormLabel>
                  <Textarea
                    minRows={2}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image you want to generate"
                  />
                </FormControl>
                <Stack
                  gap={1}
                  sx={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                  }}
                >
                  <FormControl sx={{ flex: 1, display: 'flex' }}>
                    <FormLabel>Steps</FormLabel>
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
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <FormLabel>Guidance Scale</FormLabel>
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
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <FormLabel>Seed (optional)</FormLabel>
                    <Input
                      type="number"
                      value={seed}
                      sx={{ width: 100 }}
                      onChange={(e) => setSeed(e.target.value)}
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
                </Stack>

                {/* Advanced Settings Toggle */}
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
                </Button>

                {/* Advanced Settings - Collapsible */}
                {showAdvanced && (
                  <Stack gap={2} sx={{ mt: 1 }}>
                    <FormControl>
                      <FormLabel>Negative Prompt</FormLabel>
                      <Textarea
                        minRows={2}
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
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
                      <FormControl sx={{ flex: 1 }}>
                        <FormLabel>ETA (0.0 = default)</FormLabel>
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
                      <FormControl sx={{ flex: 1 }}>
                        <FormLabel>CLIP Skip (0 = default)</FormLabel>
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
                      <FormControl sx={{ flex: 1 }}>
                        <FormLabel>Guidance Rescale (0.0 = default)</FormLabel>
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
                      }}
                    >
                      <FormControl sx={{ flex: 1 }}>
                        <FormLabel>Image Height (px) (0 = default)</FormLabel>
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
                      <FormControl sx={{ flex: 1 }}>
                        <FormLabel>Image Width (px) (0 = default)</FormLabel>
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
                    </Stack>
                  </Stack>
                )}
              </Stack>

              <Button
                onClick={handleGenerate}
                loading={loading}
                disabled={loading || isStableDiffusion === false}
                color="primary"
                size="lg"
              >
                Generate Image
              </Button>
            </Stack>
            <Box
              flex={2}
              sx={{
                overflow: 'hidden',
                display: 'flex',
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
              {imageBase64 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <img
                    src={`data:image/png;base64,${imageBase64}`}
                    alt="Generated"
                    style={{
                      borderRadius: 8,
                      maxWidth: '100%',
                      maxHeight: 'calc(100% - 60px)',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <Button
                    onClick={handleSaveImage}
                    color="neutral"
                    variant="outlined"
                    size="sm"
                  >
                    Save Image
                  </Button>
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
      </Tabs>
    </Sheet>
  );
}
