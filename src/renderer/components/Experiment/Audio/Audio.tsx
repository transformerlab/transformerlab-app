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
  Input,
  Stack,
} from '@mui/joy';
  

const voices = [
  'af_bella', 'af_heart', 'af_nicole', 'af_nova', 'af_sarah', 'af_sky',
  'am_adam', 'am_michael', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'
];

export async function sendAndReceiveAudioPath(
  currentModel: string,
  text: any,
  //note: Need to pass more params
  //voice: string,
  //speed: number,
) {

  const data: any = {
    model: currentModel,
    text,
    //note: need to pass more params
    //voice,
    //speed,
  };

  let response;
  try {
    response = await fetch(`${chatAPI.INFERENCE_SERVER_URL()}v1/audio/tts`, {
      method: 'POST', // or 'PUT'
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

  // if invalid response then return now
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
  const [voice, setVoice] = React.useState(voices[0]);
  const [speed, setSpeed] = React.useState(1.0);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);


  const handleTTSGeneration = async () => {
    setIsLoading(true);
    setAudioUrl(null);
    setErrorMessage(null);

    // note: need to pass more params
    const result = await sendAndReceiveAudioPath(currentModel, text);

    if (result && result.messages) {
      setAudioUrl(result.messages);
    } else {
      setErrorMessage(result?.message || 'Something went wrong. No audio URL received.');
    }

    setIsLoading(false);
  };


  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.level1',
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
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.surface',
        }}
      >
        <Typography level="h4">Text to Speech</Typography>
        <Typography level="body-sm">{currentModel}</Typography>
      </Box>

      {/* Main content area, split into sidebar and main panel */}
      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        
        {/* Left-hand Settings Sidebar */}
        <Sheet
          sx={{
            width: 250,
            p: 2,
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.surface',
            overflowY: 'auto',
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <Typography level="body-sm">Voice</Typography>
              <Select value={voice} onChange={(_, v) => setVoice(v!)}>
                {voices.map(v => <Option key={v} value={v}>{v}</Option>)}
              </Select>
            </FormControl>

            <FormControl>
              <Typography level="body-sm">
                Speech Speed: <b>{speed}x</b>
              </Typography>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                style={{ width: '100%' }}
              />
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
            bgcolor: 'background.level1',
          }}
        >
          <Box sx={{ flexGrow: 1, overflowY: 'auto', pb: 2 }}>
            {audioUrl && (
              <Box sx={{ mb: 2 }}>
                <Typography level="body-sm" sx={{ mb: 1 }}>Generated Audio:</Typography>
                <audio controls src={audioUrl} style={{ width: '100%' }} />
              </Box>
            )}
            
            {errorMessage && (
              <Typography level="body-sm" color="danger" sx={{ mt: 2 }}>
                {errorMessage}
              </Typography>
            )}
          </Box>

          {/* Input box and button */}
          <Box 
            sx={{ 
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1,
              bgcolor: 'background.surface',
              borderRadius: 'md',
              boxShadow: 'md',
            }}
          >
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter text to convert to speech..."
              sx={{ flexGrow: 1 }}
              multiline
              minRows={1}
            />
            <Button 
              color="primary" 
              onClick={handleTTSGeneration}
              loading={isLoading}
              disabled={!text.trim()}
            >
              Generate
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}