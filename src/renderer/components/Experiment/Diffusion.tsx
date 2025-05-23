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
} from '@mui/joy';
import { Endpoints } from 'renderer/lib/api-client/endpoints';

type DiffusionProps = {
  experimentInfo?: any;
};

export default function Diffusion({ experimentInfo }: DiffusionProps = {}) {
  const initialModel =
    experimentInfo?.config?.foundation || 'stabilityai/stable-diffusion-2-1';
  const [model] = useState(initialModel);
  const [prompt, setPrompt] = useState(
    'A fantasy landscape, trending on artstation',
  );
  const [numSteps, setNumSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isStableDiffusion, setIsStableDiffusion] = useState<boolean | null>(
    null,
  );

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setImageBase64('');
    try {
      const response = await fetch(Endpoints.Diffusion.Generate(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          num_inference_steps: Number(numSteps),
          guidance_scale: Number(guidanceScale),
          seed: seed ? Number(seed) : undefined,
        }),
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
          <FormControl>
            <FormLabel>Model</FormLabel>
            <Input
              value={model}
              disabled
              readOnly
              placeholder="Model name or path"
            />
          </FormControl>
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
              sx={{ flex: 1, display: 'flex', justifyContent: 'space-between' }}
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
              sx={{ flex: 1, display: 'flex', justifyContent: 'space-between' }}
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
            <img
              src={`data:image/png;base64,${imageBase64}`}
              alt="Generated"
              style={{
                borderRadius: 8,
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
                margin: 'auto',
              }}
            />
          )}
        </Box>
      </Stack>
    </Sheet>
  );
}
