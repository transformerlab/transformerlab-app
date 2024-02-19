import { Avatar, LinearProgress, Tooltip, Typography } from '@mui/joy';
import {
  BotIcon,
  ClipboardCopyIcon,
  Trash2Icon,
  UserCircleIcon,
} from 'lucide-react';

import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark as oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function convertNewLines(text) {
  if (typeof text !== 'string') return text;
  if (text === null) return '';
  return text.split('\n').map((str) => {
    return (
      <p style={{ margin: 0, padding: 0, marginTop: 10, marginBottom: 10 }}>
        {str}
      </p>
    );
  });
}

function displayFloatStringWithPrecision(floatString, precision) {
  if (floatString === null) return '';
  return parseFloat(floatString).toFixed(precision);
}

export default function ChatBubble({
  t,
  chat,
  chatId,
  pos,
  isThinking = false,
  hide = false,
  deleteChat = (key) => {},
}) {
  return (
    <div
      style={{
        display: hide ? 'none' : 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 'fit-content',

        padding: '10px',
        paddingLeft: '22px',
        paddingRight: '18px',
        paddingBottom: '8px',

        backgroundColor:
          pos === 'bot'
            ? 'var(--joy-palette-neutral-100)'
            : 'var(--joy-palette-primary-400)',
        marginLeft: pos === 'human' ? 'auto' : '0',
        borderRadius: '20px',
      }}
      className="chatBubble"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',

          color: pos === 'bot' ? 'black' : 'white',

          justifyContent: pos === 'bot' ? 'left' : 'right',
          textAlign: pos === 'bot' ? 'left' : 'right',
        }}
        className="chatBubbleContent"
      >
        {pos === 'human' && !isThinking && (
          <div>
            <Markdown
              children={t}
              components={{
                code(props) {
                  const { children, className, node, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || '');
                  return match ? (
                    <SyntaxHighlighter
                      {...rest}
                      PreTag="div"
                      children={String(children).replace(/\n$/, '')}
                      language={match[1]}
                      style={oneDark}
                    />
                  ) : (
                    <code {...rest} className={className}>
                      {children}
                    </code>
                  );
                },
              }}
            />
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: pos === 'bot' ? '15px' : '0',
            marginLeft: pos === 'human' ? '15px' : '0',
          }}
        >
          <Avatar
            sx={{
              float: 'left',
            }}
            size="sm"
          >
            {pos === 'bot' ? <BotIcon /> : <UserCircleIcon />}
          </Avatar>
        </div>
        {pos === 'bot' && !isThinking && (
          <div style={{ maxWidth: '40vw', overflow: 'hidden' }}>
            <Markdown
              children={t}
              components={{
                code(props) {
                  const { children, className, node, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || '');
                  return match ? (
                    <SyntaxHighlighter
                      {...rest}
                      PreTag="div"
                      children={String(children).replace(/\n$/, '')}
                      language={match[1]}
                      style={oneDark}
                    />
                  ) : (
                    <code {...rest} className={className}>
                      {children}
                    </code>
                  );
                },
              }}
            />{' '}
          </div>
        )}
        {isThinking && (
          <div>
            <p
              style={{
                margin: 0,
                padding: 0,
                marginTop: 10,
                marginBottom: 10,
              }}
            >
              {/* This is a placeholder for the bot's response.
              sendMessageToLLM automatically find this box and adds streaming
              response to it */}
              <span id="resultText" />
            </p>
            <LinearProgress
              variant="plain"
              color="neutral"
              sx={{ color: '#ddd', width: '60px' }}
            />
          </div>
        )}
      </div>
      <div
        style={{
          display: isThinking ? 'none' : 'block',
          position: 'relative',
          bottom: '20px',
          margin: 'auto',
          height: '0px',
        }}
      >
        {chat?.numberOfTokens && (
          <span className="hoverIcon showOnChatBubbleHover">
            <Typography level="body-sm">
              tokens: {chat?.numberOfTokens} -{' '}
              <Tooltip title="Tokens per second" variant="solid">
                <a>tok/s:</a>
              </Tooltip>{' '}
              {displayFloatStringWithPrecision(chat?.tokensPerSecond, 1)} -{' '}
              <Tooltip title="Time to first token" variant="solid">
                <a>TTFT:</a>
              </Tooltip>{' '}
              {displayFloatStringWithPrecision(chat?.timeToFirstToken, 2)}ms
            </Typography>
          </span>
        )}
        &nbsp;&nbsp;
        <span>
          <ClipboardCopyIcon
            color={
              pos === 'bot'
                ? 'var(--joy-palette-neutral-600)'
                : 'var(--joy-palette-neutral-100)'
            }
            size="22px"
            className="hoverIcon showOnChatBubbleHover"
            onClick={() => {
              navigator.clipboard.writeText(t);
            }}
          />
        </span>
        &nbsp;&nbsp;
        <span>
          <Trash2Icon
            color={
              pos === 'bot'
                ? 'var(--joy-palette-neutral-800)'
                : 'var(--joy-palette-neutral-100)'
            }
            size="22px"
            className="hoverIcon showOnChatBubbleHover"
            onClick={() => deleteChat(chatId)}
          />
        </span>
      </div>
    </div>
  );
}
