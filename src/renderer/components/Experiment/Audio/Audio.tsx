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
  Divider,
  Card,
} from '@mui/joy';
import { useAPI } from '../../../lib/transformerlab-api-sdk';
import AudioHistory from './AudioHistory';

const sampleRates = [16000, 22050, 24000, 44100, 48000];

export async function sendAndReceiveAudioPath(
  experimentId: number,
  currentModel: string,
  adaptor: string,
  text: any,
  file_prefix: string,
  sample_rate: number,
  temperature: number,
  speed: number,
  audioPath?: string,
) {
  const data: any = {
    experiment_id: experimentId,
    model: currentModel,
    adaptor: adaptor,
    text: text,
    file_prefix: file_prefix,
    sample_rate: sample_rate,
    temperature: temperature,
    speed: speed,
  };

  // Add audio path if provided
  if (audioPath) {
    data.audio_path = audioPath;
  }

  let response;
  try {
    response = await fetch(`${chatAPI.INFERENCE_SERVER_URL()}v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return null; // Ignore aborts
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

export async function uploadAudioFile(
  experimentId: number,
  audioFile: File,
): Promise<any> {
  const formData = new FormData();
  formData.append('audio', audioFile);

  let response;
  try {
    response = await fetch(
      `${chatAPI.INFERENCE_SERVER_URL()}v1/audio/upload_reference?experimentId=${experimentId}`,
      {
        method: 'POST',
        body: formData,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return null; // Ignore aborts
    console.log('Exception uploading audio file:', error);
    alert('Network connection error');
    return null;
  }

  if (!response.ok) {
    const response_json = await response.json();
    console.log('Audio upload response:', response_json);
    const error_text = `Audio Upload Error
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
  const adaptor = experimentInfo?.config?.adaptor || '';

  const { data: audioHistory, mutate: mutateHistory } = useAPI(
    'conversations',
    ['getAudioHistory'],
    {
      experimentId: experimentInfo?.id,
    },
  );

  const [text, setText] = React.useState('');
  const [speed, setSpeed] = React.useState(1.0);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const [filePrefix, setFilePrefix] = React.useState('output_audio');
  const [sampleRate, setSampleRate] = React.useState(24000);
  const [temperature, setTemperature] = React.useState(0.7);

  const [showSettingsModal, setShowSettingsModal] = React.useState(false);

  // Audio upload states
  const [selectedAudioFile, setSelectedAudioFile] = React.useState<File | null>(
    null,
  );
  const [uploadedAudioPath, setUploadedAudioPath] = React.useState<
    string | null
  >(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const audioHistoryRef = React.useRef<HTMLDivElement>(null);

  const handleTTSGeneration = async () => {
    setIsLoading(true);
    setAudioUrl(null);
    setErrorMessage(null);

    const result = await sendAndReceiveAudioPath(
      experimentInfo?.id,
      currentModel,
      adaptor,
      text,
      filePrefix,
      sampleRate,
      temperature,
      speed,
      uploadedAudioPath || undefined,
    );

    if (result && result.message) {
      setAudioUrl(result.message);
      // Reset audio cloning after successful generation
      handleClearUpload();
    } else {
      setErrorMessage(
        result?.message || 'Something went wrong. No audio URL received.',
      );
    }

    setIsLoading(false);
    mutateHistory();

    // Scroll AudioHistory to the top after generation
    if (audioHistoryRef.current) {
      audioHistoryRef.current.scrollTop = 0;
    }
  };

  const handleAudioUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if file is audio
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file');
      return;
    }

    setSelectedAudioFile(file);
    setIsUploading(true);

    const result = await uploadAudioFile(experimentInfo?.id, file);

    if (result && result.audioPath) {
      setUploadedAudioPath(result.audioPath);
    } else {
      alert('Failed to upload audio file');
    }

    setIsUploading(false);
  };

  const handleClearUpload = () => {
    setSelectedAudioFile(null);
    setUploadedAudioPath(null);
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
          p: 1,
          mb: 2,
        }}
      >
        <Typography level="h2">Text to Speech</Typography>
        <Box sx={{ textAlign: 'right' }}>
          <Typography level="body-sm">{currentModel}</Typography>
          {adaptor && (
            <Typography level="body-xs" color="neutral">
              {adaptor}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Main content area, split into sidebar and main panel */}
      <Box sx={{ display: 'flex', minHeight: 0 }}>
        {/* Left-hand Settings Sidebar */}
        <Sheet
          sx={{
            p: 1,
            pr: 2,
            overflowY: 'auto',
            minWidth: '220px',
          }}
        >
          <Typography level="title-lg" sx={{ mb: 1 }}>
            Generation Settings:
          </Typography>
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
          </Stack>

          <Divider sx={{ my: 2 }} />

          {/* Audio Upload Section */}
          <Typography level="title-lg" sx={{ mb: 1 }}>
            Audio Cloning:
          </Typography>
          <Stack spacing={2} sx={{ py: 1 }}>
            <FormControl>
              <FormLabel>Upload Audio File</FormLabel>
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                style={{ display: 'none' }}
                id="audio-upload-input"
              />
              <Button
                component="label"
                htmlFor="audio-upload-input"
                variant="outlined"
                color="neutral"
                loading={isUploading}
                size="sm"
              >
                Choose Audio File
              </Button>
            </FormControl>

            {selectedAudioFile && (
              <Card variant="soft" sx={{ p: 2 }}>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Selected: {selectedAudioFile.name}
                </Typography>
                <Typography level="body-xs" color="neutral">
                  Size: {(selectedAudioFile.size / 1024 / 1024).toFixed(2)} MB
                </Typography>
                {uploadedAudioPath && (
                  <Typography level="body-xs" color="success" sx={{ mt: 1 }}>
                    ✓ Upload successful
                  </Typography>
                )}
                <Button
                  size="sm"
                  variant="plain"
                  color="danger"
                  onClick={handleClearUpload}
                  sx={{ mt: 1, alignSelf: 'flex-start' }}
                >
                  Deselect Audio
                </Button>
              </Card>
            )}
          </Stack>
        </Sheet>

        {/* Right-hand Main Panel for Input/Output */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            p: 1,
            width: '100%',
          }}
        >
          {/* Large text input area at the top */}
          <FormControl sx={{ mt: 1 }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your text here for speech generation..."
              style={{
                minHeight: '100px',
                padding: '16px',
                borderRadius: '8px',
                fontSize: '16px',
                lineHeight: '1.5',
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            />
          </FormControl>

          {/* Controls and output below the text input */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              my: 2,
            }}
          >
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

            {errorMessage && (
              <Typography level="body-sm" color="danger">
                {errorMessage}
              </Typography>
            )}
          </Box>
          <AudioHistory
            ref={audioHistoryRef}
            audioHistory={audioHistory || []}
            experimentId={experimentInfo?.id}
            mutateHistory={mutateHistory}
          />
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
        </ModalDialog>
      </Modal>
    </Box>
  );
}
