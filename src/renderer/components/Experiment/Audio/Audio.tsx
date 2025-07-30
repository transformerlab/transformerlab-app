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

 const sendNewMessageToLLM = async (text: String, image?: string) => {
    // Add new user message to chat history
    var newChats = addUserChat(text, image);

    const timeoutId = setTimeout(() => {
      setIsThinking(true);
    }, 100);

    const systemMessage =
      document.getElementsByName('system-message')[0]?.value;

    // Get a list of all the existing chats so we can send them to the LLM
    let texts = getChatsInLLMFormat();

    // Add the user's message
    if (image && image !== '') {
      //Images must be sent in this format for fastchat
      texts.push({
        role: 'user',
        content: [
          { type: 'text', text: text },
          { type: 'image_url', image_url: image },
        ],
      });
      //texts.push({ role: 'user', content: { image } });
    } else {
      texts.push({ role: 'user', content: text });
    }

    const generationParamsJSON = experimentInfo?.config?.generationParams;
    const generationParameters = JSON.parse(generationParamsJSON);

    try {
      generationParameters.stop_str = JSON.parse(
        generationParameters?.stop_str,
      );
    } catch (e) {
      console.log('Error parsing stop strings as JSON');
    }

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

    clearTimeout(timeoutId);
    setIsThinking(false);
    // Add Response to Chat Array:

    let numberOfTokens = await chatAPI.countTokens(currentModel, [
      result?.text,
    ]);
    numberOfTokens = numberOfTokens?.tokenCount;
    console.log('Number of Tokens: ', numberOfTokens);
    console.log(result);
    const timeToFirstToken = result?.timeToFirstToken;
    const tokensPerSecond = (numberOfTokens / parseFloat(result?.time)) * 1000;

    newChats = [
      ...newChats,
      {
        t: result?.text,
        user: 'bot',
        key: result?.id,
        numberOfTokens: numberOfTokens,
        timeToFirstToken: timeToFirstToken,
        tokensPerSecond: tokensPerSecond,
      },
    ];

    setChats((prevChat) => [
      ...prevChat,
      {
        t: result?.text,
        user: 'bot',
        key: result?.id,
        numberOfTokens: numberOfTokens,
        timeToFirstToken: timeToFirstToken,
        tokensPerSecond: tokensPerSecond,
      },
    ]);

    // If this is a new conversation, generate a new conversation Id
    var cid = conversationId;
    const experimentId = experimentInfo?.id;

    if (cid == null) {
      cid = Math.random().toString(36).substring(7);
      setConversationId(cid);
    }

    //save the conversation to the server
    fetch(chatAPI.Endpoints.Experiment.SaveConversation(experimentId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: cid,
        conversation: JSON.stringify(newChats),
      }),
    }).then((response) => {
      conversationsMutate();
    });

    scrollChatToBottom();
    focusChatInput();
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