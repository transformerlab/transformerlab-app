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
import { useAPI } from '../../../lib/transformerlab-api-sdk';
import TranscriptionHistory from './TranscriptionHistory';

export async function sendAndReceiveTranscription(
  currentModel: string,
  audioPath: string,
  experimentId?: number,
  //format: string,
) {
  const data: any = {
    model: currentModel,
    audio_path: audioPath,
    experiment_id: experimentId,
  };

  let response;
  try {
    response = await fetch(
      `${chatAPI.INFERENCE_SERVER_URL()}v1/audio/transcriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(data),
      },
    );
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

  const { data: transcriptionHistory, mutate: mutateHistory } = useAPI(
    'conversations',
    ['getTranscriptionHistory'],
    {
      experimentId: experimentInfo?.id,
    },
  );

  // Audio upload state and handler
  const [inputAudio, setInputAudio] = React.useState('');
  const [audioPath, setAudioPath] = React.useState('');
  const [audioFileName, setAudioFileName] = React.useState('');

  const handleAudioUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    console.log('test', event.target.files);
    if (file) {
      setInputAudio(file);
      setAudioFileName(file.name);
      event.target.value = '';

      console.log(experimentInfo?.id);
      const formData = new FormData();
      formData.append('experimentId', experimentInfo?.id);
      formData.append('audio', file);

      try {
        const response = await fetch(
          `${chatAPI.INFERENCE_SERVER_URL()}v1/audio/upload?experimentId=${experimentInfo?.id}`,
          {
            method: 'POST',
            body: formData,
          },
        );
        const result = await response.json();
        console.log('Upload result:', result);
        setAudioPath(result.audioPath);
      } catch (error) {
        console.log('are we here?');
        setErrorMessage('Audio upload failed');
      }
    }
  };
  const [transcription, setTranscription] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const transcriptionHistoryRef = React.useRef<HTMLDivElement>(null);

  const handleSTTGeneration = async () => {
    setIsLoading(true);
    setTranscription(null);
    setErrorMessage(null);

    const result = await sendAndReceiveTranscription(
      currentModel,
      audioPath,
      experimentInfo?.id,
    );

    if (result && result.message) {
      setTranscription(result.message);
    } else {
      setErrorMessage(
        result?.message || 'Something went wrong. No transcription received.',
      );
    }

    setIsLoading(false);
    mutateHistory();

    // Scroll AudioHistory to the top after generation
    if (transcriptionHistoryRef.current) {
      transcriptionHistoryRef.current.scrollTop = 0;
    }
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
        <Typography level="h2">Speech to Text</Typography>
        <Typography level="body-sm">{currentModel}</Typography>
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
        ></Sheet>

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
          <FormControl sx={{ flexGrow: 1, mt: 1 }}>
            <FormLabel>Upload Audio File</FormLabel>
            <Button
              component="label"
              variant="solid"
              size="lg"
              sx={{ width: '100%' , mb: 1}}
            >
              {audioFileName ? audioFileName : 'Select Audio File'}
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                style={{ display: 'none' }}
              />
            </Button>
            {audioFileName && (
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Selected file: {audioFileName}
              </Typography>
            )}
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
                onClick={handleSTTGeneration}
                loading={isLoading}
                disabled={!inputAudio}
              >
                Generate Transcription
              </Button>
            </Stack>

            {errorMessage && (
              <Typography level="body-sm" color="danger">
                {errorMessage}
              </Typography>
            )}
          </Box>
          <TranscriptionHistory
            ref={transcriptionHistoryRef}
            transcriptionHistory={transcriptionHistory || []}
            experimentId={experimentInfo?.id}
            mutateHistory={mutateHistory}
          />
        </Box>
      </Box>
    </Box>
  );
}
