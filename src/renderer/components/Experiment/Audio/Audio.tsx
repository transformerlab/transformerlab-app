import * as React from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import {
  Sheet,
  FormControl,
  Button,
  Typography,
  Box,
  Select,
  Option,
  Input,
} from '@mui/joy';

const voices = [
  'af_bella', 'af_heart', 'af_nicole', 'af_nova', 'af_sarah', 'af_sky',
  'am_adam', 'am_michael', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'
];
const models = [
  'mlx-community/Kokoro-82M-4bit',
  'mlx-community/Kokoro-82M-6bit',
  'mlx-community/Kokoro-82M-8bit',
  'mlx-community/Kokoro-82M-bf16'
];

export async function sendAndReceiveAudioPath(
  currentModel: string,
  text: any,
) {

  const data: any = {
    model: currentModel,
    text,
  };

  let response;
  try {
    response = await fetch(`${chatAPI.INFERENCE_SERVER_URL()}v1/audio/speech`, {
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

const sendNewMessageToTTS = async (
  text: string,
  tempModel: string,
  setResultMessage: (msg: string) => void,
  setIsLoading: (loading: boolean) => void
) => {
  setIsLoading(true);

  const result = await sendAndReceiveAudioPath(tempModel, text);
  setResultMessage(result?.message ?? 'Something went wrong. No message received.');

  setIsLoading(false);
};

export default function Audio() {
  const [text, setText] = React.useState('');
  const [voice, setVoice] = React.useState(voices[0]);
  const [model, setModel] = React.useState(models[0]); // will remove later, only for testing
  const [speed, setSpeed] = React.useState(1.0);
  const [resultMessage, setResultMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);


  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '100%',
        overflow: 'hidden',
        bgcolor: 'background.level1',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
      }}
    >
      <Box
        sx={{
          width: 340,
          bgcolor: 'background.level2',
          borderRadius: 'md',
          boxShadow: 'md',
          p: 3,
        }}
      >
        <Typography level="h4" sx={{ mb: 2 }}>
          Text to Speech
        </Typography>

        <FormControl sx={{ mb: 2 }}>
          <Typography level="body-sm" sx={{ mb: 1 }}>
            Text to convert:
          </Typography>
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Enter text here..."
            sx={{ width: '100%' }}
          />
        </FormControl>

        <FormControl sx={{ mb: 2 }}>
          <Typography level="body-sm" sx={{ mb: 1 }}>
            Voice:
          </Typography>
          <Select value={voice} onChange={(_, v) => setVoice(v!)} sx={{ width: '100%' }}>
            {voices.map(v => <Option key={v} value={v}>{v}</Option>)}
          </Select>
        </FormControl>

        <FormControl sx={{ mb: 2 }}>
          <Typography level="body-sm" sx={{ mb: 1 }}>
            Model:
          </Typography>
          <Select value={model} onChange={(_, v) => setModel(v!)} sx={{ width: '100%' }}>
            {models.map(m => <Option key={m} value={m}>{m}</Option>)}
          </Select>
        </FormControl>

        <FormControl sx={{ mb: 2 }}>
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

        <Button color="primary" sx={{ mt: 2 }} onClick={() => sendNewMessageToTTS(text, model, setResultMessage, setIsLoading)}
  loading={isLoading}>
          Generate Speech
        </Button>
        {resultMessage && (
          <Typography level="body-sm" sx={{ mt: 2 }}>
            {resultMessage}
          </Typography>
        )}
      </Box>
    </Sheet>
  );
}