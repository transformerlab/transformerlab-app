import {
  Button,
  CircularProgress,
  IconButton,
  Sheet,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy';
import { time } from 'console';
import { SendIcon, StopCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import ChatSettingsOnLeftHandSide from './ChatSettingsOnLeftHandSide';

export default function CompletionsPage({
  text,
  setText,
  debouncedText,
  tokenCount,
  isThinking,
  sendCompletionToLLM,
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
  const [timeTaken, setTimeTaken] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  async function handleSend() {
    setTimeTaken(-1);
    const startTime = performance.now();

    setText(inputRef.current?.value);

    const originalText = inputRef.current?.value;

    const result = await sendCompletionToLLM(
      inputRef.current,
      inputRef.current
    );

    if (result) {
      setText(originalText + result);
    }
    const endTime = performance.now();
    setTimeTaken(endTime - startTime);
  }

  function SubmitGenerateButton() {
    return (
      <>
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
            {isThinking ? <>Generating</> : 'Generate'}
          </Button>
        </Stack>
      </>
    );
  }

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
        }}
      >
        <Sheet
          variant="outlined"
          sx={{
            flex: 1,
            overflow: 'auto',
            padding: 2,
            margin: 'auto',
            flexDirection: 'column',
            width: '100%',
          }}
        >
          <Textarea
            defaultValue={text}
            variant="plain"
            name="completion-text"
            minRows={20}
            slotProps={{
              textarea: { ref: inputRef, id: 'completion-textarea' },
            }}
            sx={{
              flex: 1,
              height: '100%',
              '--Textarea-focusedHighlight': 'rgba(13,110,253,0)',
              '& .MuiTextarea-textarea': { overflow: 'auto !important' },
            }}
            endDecorator={
              <Typography level="body-xs" sx={{ ml: 'auto' }}>
                {text !== debouncedText ? (
                  <CircularProgress
                    color="neutral"
                    sx={{
                      '--CircularProgress-size': '16px',
                      '--CircularProgress-trackThickness': '4px',
                      '--CircularProgress-progressThickness': '3px',
                    }}
                  />
                ) : (
                  tokenCount?.tokenCount
                )}{' '}
                of {tokenCount?.contextLength} tokens
              </Typography>
            }
          />
        </Sheet>
        <Stack direction="row" justifyContent="space-between">
          <div>
            {timeTaken && timeTaken !== -1 && (
              <Typography level="body-sm" color="neutral">
                Time taken: {Math.round(timeTaken)}ms
              </Typography>
            )}
            {timeTaken == -1 && <CircularProgress size="sm" />}
          </div>
          <SubmitGenerateButton />
        </Stack>
      </div>
    </Sheet>
  );
}
