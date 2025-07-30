import * as React from 'react';
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

export async function sendAndReceiveStreaming(
  currentModel: string,
  //currentAdaptor: string,
  texts: any,
  //temperature: number,
  //maxTokens: number,
  //topP: number,
  //freqencyPenalty: number,
  //systemMessage: string,
  //stopString = null,
  //image?: string,
  //minP?: number,
) {
  //let shortModelName = currentModel.split('/').slice(-1)[0];

  let messages = [];
  //messages.push({ role: 'system', content: systemMessage });
  messages = messages.concat(texts);
  const data: any = {
    model: shortModelName,
    adaptor: currentAdaptor,
    stream: true, // For streaming responses
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    frequency_penalty: freqencyPenalty,
    system_message: systemMessage,
    ...(minP !== undefined ? { min_p: minP } : {}),
  };

  // console.log('data', data);

  if (stopString) {
    data.stop = stopString;
  }

  let result;
  var id = Math.random() * 1000;

  const resultText = document.getElementById('resultText');
  if (resultText) resultText.innerText = '';

  let response;
  try {
    response = await fetch(`${INFERENCE_SERVER_URL()}v1/chat/completions`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.log('Exception accessing completions API:', error);
    alert('Network connection error');
    return null;
  }

  // if invalid response then return now
  if (!response.ok) {
    const response_json = await response.json();
    console.log('Completions API response:', response_json);
    const error_text = `Completions API Error
      HTTP Error Code: ${response?.status}
      ${response_json?.message}`;
    console.log(error_text);
    alert(error_text);
    return null;
  }

  // Read the response as a stream of data
  const reader = response?.body?.getReader();
  const decoder = new TextDecoder('utf-8');

  let finalResult = '';

  var start = performance.now();
  var firstTokenTime = null;
  var end = start;
  stopStreaming = false;

  // Reader loop
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();

      if (stopStreaming) {
        console.log('User requested to stop streaming');
        stopStreaming = false;
        reader?.cancel();
      }

      if (firstTokenTime == null) firstTokenTime = performance.now();

      if (done) {
        break;
      }
      // Massage and parse the chunk of data
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      let parsedLines = [];
      //console.log(lines);
      try {
        parsedLines = lines
          .map((line) => line.replace(/^data: /, '').trim()) // Remove the "data: " prefix
          .filter((line) => line !== '' && line !== '[DONE]') // Remove empty lines and "[DONE]"
          .map((line) => JSON.parse(line)); // Parse the JSON string
      } catch (error) {
        console.log('error parsing line', error);
      }
      // console.log(parsedLines);

      // eslint-disable-next-line no-restricted-syntax
      for (const parsedLine of parsedLines) {
        const { choices } = parsedLine;
        const { delta } = choices[0];
        const { content } = delta;

        id = parsedLine.id;
        // Update the UI with the new content
        if (content) {
          finalResult += content;
          if (resultText) {
            document.getElementById('resultText').innerText = finalResult;
            setTimeout(
              () => document.getElementById('endofchat')?.scrollIntoView(),
              100,
            );
          }
        }
      }
    }

    result = finalResult;
  } catch (error) {
    console.log('There was an error:', error);
  }

  // Stop clock:
  end = performance.now();
  var time = end - firstTokenTime;
  var timeToFirstToken = firstTokenTime - start;

  if (result) {
    if (resultText) resultText.innerText = '';
    return {
      id: id,
      text: result,
      time: time,
      timeToFirstToken: timeToFirstToken,
    };
  }
  return null;
}

 const sendNewMessageToTTS = async (text: String, image?: string) => {
    //no idea for now if we need this or not
    const generationParamsJSON = experimentInfo?.config?.generationParams;
    const generationParameters = JSON.parse(generationParamsJSON);


    // Send them over
    const result = await chatAPI.sendAndReceiveStreaming(
      currentModel,
      adaptor,
      texts,
      generationParameters?.temperature,
      generationParameters?.maxTokens,
      generationParameters?.topP,
      generationParameters?.frequencyPenalty,
      systemMessage,
      generationParameters?.stop_str,
      image,
      generationParameters?.minP,
    );

    return result?.text;
  };

export default function Audio() {
  const [text, setText] = React.useState('');
  const [voice, setVoice] = React.useState(voices[0]);
  const [model, setModel] = React.useState(models[0]);
  const [speed, setSpeed] = React.useState(1.0);

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

        <Button color="primary" sx={{ mt: 2 }}>
          Generate Speech
        </Button>
      </Box>
    </Sheet>
  );
}