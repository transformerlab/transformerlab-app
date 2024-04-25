import {
  Button,
  CircularProgress,
  Sheet,
  Textarea,
  Typography,
} from '@mui/joy';
import { SendIcon } from 'lucide-react';

export default function CompletionsPage({
  text,
  setText,
  debouncedText,
  tokenCount,
  isThinking,
  sendCompletionToLLM,
}) {
  return (
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
          placeholder="When I was young, I would"
          variant="plain"
          name="completion-text"
          minRows={20}
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
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </Sheet>
      <Button
        sx={{ ml: 'auto' }}
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
            <SendIcon />
          )
        }
        disabled={isThinking}
        id="chat-submit-button"
        onClick={() =>
          sendCompletionToLLM(
            document.getElementsByName('completion-text')?.[0]
          )
        }
      >
        {isThinking ? 'Generating' : 'Generate'}
      </Button>
    </div>
  );
}
