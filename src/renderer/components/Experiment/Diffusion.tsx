import { useState } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Sheet,
  Stack,
  Typography,
  Textarea,
} from '@mui/joy';
import { Endpoints } from 'renderer/lib/api-client/endpoints';

type DiffusionProps = {
  experimentInfo?: any;
};

export default function Diffusion({ experimentInfo }: DiffusionProps = {}) {
  const initialModel =
    experimentInfo?.config?.foundation || 'stabilityai/stable-diffusion-2-1';
  const [model] = useState(initialModel);
  console.log('Diffusion model:', model);
  const [prompt, setPrompt] = useState(
    'A fantasy landscape, trending on artstation',
  );
  const [numSteps, setNumSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <Sheet sx={{ p: 3, maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography level="h2" mb={2}>
        Diffusion Image Generation
      </Typography>
      <Stack spacing={2}>
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
        <Stack direction="row" spacing={2}>
          <FormControl sx={{ flex: 1 }}>
            <FormLabel>Steps</FormLabel>
            <Input
              type="number"
              value={numSteps}
              onChange={(e) => setNumSteps(Number(e.target.value))}
            />
          </FormControl>
          <FormControl sx={{ flex: 1 }}>
            <FormLabel>Guidance Scale</FormLabel>
            <Input
              type="number"
              value={guidanceScale}
              onChange={(e) => setGuidanceScale(Number(e.target.value))}
            />
          </FormControl>
          <FormControl sx={{ flex: 1 }}>
            <FormLabel>Seed (optional)</FormLabel>
            <Input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </FormControl>
        </Stack>
        <Button
          onClick={handleGenerate}
          loading={loading}
          disabled={loading}
          color="primary"
          size="lg"
        >
          Generate Image
        </Button>
        {error && <Typography color="danger">{error}</Typography>}
        {imageBase64 && (
          <img
            src={`data:image/png;base64,${imageBase64}`}
            alt="Generated"
            style={{ maxWidth: '100%', borderRadius: 8, marginTop: 16 }}
          />
        )}
      </Stack>
    </Sheet>
  );
}
