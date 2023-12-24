import { useState } from 'react';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import Textarea from '@mui/joy/Textarea';
import {
  DeleteIcon,
  InfoIcon,
  SaveIcon,
  SendIcon,
  XCircleIcon,
} from 'lucide-react';
import {
  CircularProgress,
  Select,
  Tooltip,
  Typography,
  Option,
} from '@mui/joy';

function scrollChatToBottom() {
  document.getElementById('endofchat').scrollIntoView();
}

export default function ChatSubmit({
  addMessage,
  spinner,
  clearHistory,
  tokenCount,
  text,
  debouncedText,
}) {
  const [italic] = useState(false);
  const [fontWeight] = useState('normal');

  return (
    <FormControl sx={{ width: '100%', margin: 'auto', flex: 1 }}>
      <Textarea
        placeholder="Type something here..."
        minRows={3}
        slotProps={{
          textarea: {
            id: 'chat-input',
            name: 'chat-input',
          },
        }}
        endDecorator={
          <Box
            sx={{
              display: 'flex',
              gap: 'var(--Textarea-paddingBlock)',
              pt: 'var(--Textarea-paddingBlock)',
              borderTop: '1px solid',
              borderColor: 'divider',
              flex: 'auto',
              alignItems: 'center',
            }}
          >
            <Button
              color="neutral"
              variant="plain"
              sx={{ color: 'text.tertiary' }}
              startDecorator={<XCircleIcon />}
              onClick={() => {
                clearHistory();
              }}
            >
              Clear Chat History
            </Button>
            <Typography
              level="body-xs"
              sx={{ ml: 'auto' }}
              color={
                tokenCount?.tokenCount > tokenCount?.contextLength
                  ? 'danger'
                  : 'neutral'
              }
            >
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
              of {tokenCount?.contextLength} tokens &nbsp;
              <Tooltip title="Approximation only" followCursor>
                <InfoIcon size="12px" />
              </Tooltip>
            </Typography>
            <Button
              sx={{ ml: 'auto' }}
              color="neutral"
              endDecorator={
                spinner ? (
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
              disabled={spinner}
              id="chat-submit-button"
              onClick={() => {
                scrollChatToBottom();
                const msg = document.getElementById('chat-input').value;
                document.getElementById('chat-input').value = '';
                document.getElementById('chat-input').focus();
                addMessage(msg);
              }}
            >
              {spinner ? 'Generating' : 'Submit'}
            </Button>
          </Box>
        }
        sx={{
          minWidth: 300,
          fontWeight,
          fontStyle: italic ? 'italic' : 'initial',
        }}
        onKeyDown={(event) => {
          // Support Submit on Enter, but ignore if
          // User types shift-enter
          if (event.shiftKey) return;
          if (event.keyCode === 13) {
            event.preventDefault();
            document.getElementById('chat-submit-button').click();
          }
        }}
      />
    </FormControl>
  );
}
