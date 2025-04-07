import {
  Alert,
  Button,
  CircularProgress,
  IconButton,
  Input,
  Sheet,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy';
import {
  ConstructionIcon,
  LightbulbIcon,
  SendIcon,
  StopCircle,
} from 'lucide-react';
import { useRef, useState, useCallback } from 'react';
import ChatSettingsOnLeftHandSide from './ChatSettingsOnLeftHandSide';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import RenderLogProbs from './RenderLogProbs';

function SubmitGenerateButton({ isThinking, stopStreaming, handleSend }) {
  return (
    <Stack
      flexDirection="row"
      sx={{ display: 'flex', justifyContent: 'flex-end' }}
    >
      {isThinking && (
        <IconButton color="danger">
          <StopCircle onClick={stopStreaming} />
        </IconButton>
      )}
      <Button
        sx={{}}
        color="neutral"
        endDecorator={
          isThinking ? (
            <CircularProgress
              thickness={2}
              size="sm"
              color="neutral"
              sx={{
                '--CircularProgress-size': '13px',
              }}
            />
          ) : (
            <SendIcon size="20px" />
          )
        }
        disabled={isThinking}
        id="chat-submit-button"
        onClick={handleSend}
      >
        {isThinking ? <>Generating</> : 'Visualize'}
      </Button>
    </Stack>
  );
}

export default function CompletionsPage({
  tokenCount,
  stopStreaming,
  generationParameters,
  setGenerationParameters,
  defaultPromptConfigForModel,
  conversations,
  conversationsIsLoading,
  conversationsMutate,
  setChats,
  setConversationId,
  conversationId,
  experimentInfo,
  experimentInfoMutate,
}) {
  const [text, setText] = useState('');
  const [logProbs, setLogProbs] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [timeTaken, setTimeTaken] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);

  const updateFunction = useCallback((t) => {
    let tx = '';
    for (let i = 0; i < t.length; i++) {
      tx += t[i].text;
    }
    setText(tx);
    setLogProbs(t);
  }, []);

  const sendCompletionToLLM = useCallback(
    async (element, targetElement) => {
      const text = element.value;

      setIsThinking(true);

      var inferenceParams = '';

      if (experimentInfo?.config?.inferenceParams) {
        inferenceParams = experimentInfo?.config?.inferenceParams;
        inferenceParams = JSON.parse(inferenceParams);
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

      const currentModel = experimentInfo?.config?.foundation;
      const adaptor = experimentInfo?.config?.adaptor;

      const result = await chatAPI.sendCompletionReactWay(
        currentModel,
        adaptor,
        text,
        generationParameters?.temperature,
        generationParameters?.maxTokens,
        generationParameters?.topP,
        false,
        generationParameters?.stop_str,
        updateFunction,
        true,
      );
      setIsThinking(false);

      return result;
    },
    [experimentInfo, updateFunction],
  );

  const handleSend = useCallback(async () => {
    setTimeTaken(-1);
    const startTime = performance.now();

    outputRef.current.value = '';
    setText('');

    const result = await sendCompletionToLLM(
      inputRef.current,
      outputRef.current,
    );

    if (result) {
      setText(result?.choices?.[0]?.text);
      setLogProbs(result?.choices[0]?.logprobs);
    }
    const endTime = performance.now();
    setTimeTaken(endTime - startTime);
  }, [sendCompletionToLLM, setTimeTaken, setText, setLogProbs]);

  // Moved SubmitGenerateButton outside of CompletionsPage

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        gap: 2,
      }}
    >
      <ChatSettingsOnLeftHandSide
        generationParameters={generationParameters}
        setGenerationParameters={setGenerationParameters}
        tokenCount={tokenCount}
        defaultPromptConfigForModel={defaultPromptConfigForModel}
        conversations={conversations}
        conversationsIsLoading={conversationsIsLoading}
        conversationsMutate={conversationsMutate}
        setChats={setChats}
        setConversationId={setConversationId}
        conversationId={conversationId}
        experimentInfo={experimentInfo}
        experimentInfoMutate={experimentInfoMutate}
      />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          paddingBottom: '10px',
          height: '100%',
          justifyContent: 'space-between',
          overflow: 'hidden',
          textWrap: 'wrap',
          overflowWrap: 'break-word',
        }}
      >
        <Input
          name="starting-text"
          placeholder="Enter text to complete here"
          slotProps={{
            input: {
              ref: inputRef,
              onKeyDown: (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              },
            },
          }}
        />
        <Sheet
          variant="outlined"
          sx={{
            flex: 1,
            overflow: 'auto',
            padding: 2,
            margin: 'auto',
            flexDirection: 'column',
            width: '100%',
            display: 'none',
          }}
        >
          <Textarea
            value={text}
            variant="plain"
            name="completion-text"
            minRows={20}
            readOnly
            slotProps={{
              textarea: { id: 'completion-textarea', ref: outputRef },
            }}
            sx={{
              flex: 1,
              height: '100%',
              '--Textarea-focusedHighlight': 'rgba(13,110,253,0)',
              '& .MuiTextarea-textarea': { overflow: 'auto !important' },
            }}
          />
        </Sheet>
        <Sheet sx={{ flex: 1, width: '100%', overflow: 'auto' }}>
          <RenderLogProbs logProbs={logProbs} />
        </Sheet>
        <Stack direction="row" justifyContent="space-between">
          <div>
            {timeTaken && timeTaken !== -1 && (
              <Typography level="body-sm" color="neutral">
                Time taken: {Math.round(timeTaken)}ms
              </Typography>
            )}
            {timeTaken == -1 && <CircularProgress size="sm" />}
          </div>{' '}
          <SubmitGenerateButton
            isThinking={isThinking}
            stopStreaming={stopStreaming}
            handleSend={handleSend}
          />
        </Stack>
      </div>
    </Sheet>
  );
}
