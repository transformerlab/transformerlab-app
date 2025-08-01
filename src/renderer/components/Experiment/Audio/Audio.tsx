import * as React from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

import {
  Sheet,
  FormControl,
  Button,
  Typography,
  Box,
  Select,
  Option,
  Textarea,
  Stack,
  Slider,
  FormLabel,
  Switch,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
} from '@mui/joy';

const audioFormats = ['wav', 'flac', 'ogg'];
const sampleRates = [16000, 22050, 24000, 44100, 48000];

export async function sendAndReceiveAudioPath(
  currentModel: string,
  text: any,
  stream: boolean,
  file_prefix: string,
  audio_format: string,
  sample_rate: number,
  temperature: number,
  speed: number,
) {
  const data: any = {
    model: currentModel,
    text,
    stream,
    file_prefix,
    audio_format,
    sample_rate,
    temperature,
    speed,
  };

  let response;
  try {
    response = await fetch(`${chatAPI.INFERENCE_SERVER_URL()}v1/audio/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.log('Exception accessing Audio API:', error);
    alert('Network connection error');
    return null;
  }

  if (!response.ok) {
    const response_json = await response.json();
    console.log('Audio API response:', response_json);
    const error_text = `Audio API Error
      HTTP Error Code: ${response?.status}
      ${response_json?.message}`;
    console.log(error_text);
    alert(error_text);
    return null;
  }
  return await response.json();
}

export default function Audio() {
  const { experimentInfo } = useExperimentInfo();
  const currentModel = experimentInfo?.config?.foundation;

  const [text, setText] = React.useState('');
  const [speed, setSpeed] = React.useState(1.0);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const [stream, setStream] = React.useState(false);
  const [filePrefix, setFilePrefix] = React.useState('output_audio');
  const [audioFormat, setAudioFormat] = React.useState(audioFormats[0]);
  const [sampleRate, setSampleRate] = React.useState(24000);
  const [temperature, setTemperature] = React.useState(0.7);

  const [showSettingsModal, setShowSettingsModal] = React.useState(false);

  const handleTTSGeneration = async () => {
    setIsLoading(true);
    setAudioUrl(null);
    setErrorMessage(null);

    const result = await sendAndReceiveAudioPath(
      currentModel,
      text,
      stream,
      filePrefix,
      audioFormat,
      sampleRate,
      temperature,
      speed,
    );

    if (result && result.messages) {
      setAudioUrl(result.messages);
    } else {
      setErrorMessage(
        result?.message || 'Something went wrong. No audio URL received.',
      );
    }

    setIsLoading(false);
  };
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Top Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 2,
        }}
      >
        <Typography level="h2">Text to Speech</Typography>
        <Typography level="body-sm">{currentModel}</Typography>
      </Box>

      {/* Main content area, split into sidebar and main panel */}
      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        {/* Left-hand Settings Sidebar */}
        <Sheet
          sx={{
            width: 300,
            p: 3,
            overflowY: 'auto',
          }}
        >
          <Stack spacing={3}>
            <FormControl>
              <FormLabel>Output File Name</FormLabel>
              <Input
                value={filePrefix}
                onChange={(e) => setFilePrefix(e.target.value)}
                placeholder="e.g., my_speech_file"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Audio Format</FormLabel>
              <Select
                value={audioFormat}
                onChange={(_, v) => setAudioFormat(v!)}
              >
                {audioFormats.map((format) => (
                  <Option key={format} value={format}>
                    {format}
                  </Option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <Button
                variant="soft"
                onClick={() => setShowSettingsModal(true)}
                sx={{ width: '100%' }}
              >
                All Generation Settings
              </Button>
            </FormControl>
          </Stack>
        </Sheet>

        {/* Right-hand Main Panel for Input/Output */}
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            p: 3,
          }}
        >
          {/* Large text input area at the top */}
          <FormControl sx={{ flexGrow: 1 }}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your text here for speech generation..."
              sx={{
                height: '100%',
                minHeight: '100px',
                p: 2,
                borderRadius: 'md',
                fontSize: 'md',
                lineHeight: 'md',
              }}
            />
          </FormControl>

          {/* Controls and output below the text input */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignSelf: 'flex-start' }}>
              <Button
                color="primary"
                onClick={handleTTSGeneration}
                loading={isLoading}
                disabled={!text.trim()}
              >
                Generate Speech
              </Button>
            </Stack>

            {audioUrl && (
              <Box sx={{ width: '100%' }}>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Generated audio file:{' '}
                  <a href={audioUrl} target="_blank">
                    {audioUrl}
                  </a>
                </Typography>
                <audio controls src={audioUrl} style={{ width: '100%' }} />
              </Box>
            )}

            {errorMessage && (
              <Typography level="body-sm" color="danger">
                {errorMessage}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {/* The Modal for All Generation Settings */}
      <Modal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      >
        <ModalDialog variant="outlined" sx={{ minWidth: 400, minHeight: 300 }}>
          <ModalClose />
          <DialogTitle>Generation Settings</DialogTitle>
          <Stack spacing={3} sx={{ py: 2 }}>
            {/* Sample Rate */}
            <FormControl>
              <FormLabel>Sample Rate</FormLabel>
              <Select
                value={String(sampleRate)}
                onChange={(_, v) => setSampleRate(Number(v!))}
              >
                {sampleRates.map((rate) => (
                  <Option key={rate} value={String(rate)}>
                    {rate} Hz
                  </Option>
                ))}
              </Select>
            </FormControl>

            <Box
              sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}
            >
              <FormControl>
                <FormLabel>
                  Temperature: <b>{temperature.toFixed(1)}</b>
                </FormLabel>
                <Slider
                  aria-label="Temperature"
                  value={temperature}
                  onChange={(_, v) => setTemperature(v as number)}
                  min={0.0}
                  max={1.0}
                  step={0.1}
                  valueLabelDisplay="auto"
                />
              </FormControl>

              <FormControl>
                <FormLabel>
                  Speech Speed: <b>{speed}x</b>
                </FormLabel>
                <Slider
                  aria-label="Speech Speed"
                  value={speed}
                  onChange={(_, v) => setSpeed(v as number)}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  valueLabelDisplay="auto"
                />
              </FormControl>
            </Box>

            <FormControl
              orientation="horizontal"
              sx={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <FormLabel sx={{ mb: 0 }}>Stream Output</FormLabel>
              <Switch
                checked={stream}
                onChange={(event) => setStream(event.target.checked)}
                size="md"
              />
            </FormControl>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
