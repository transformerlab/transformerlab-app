import { LinearProgress, Tooltip, Typography } from '@mui/joy';
import { ClipboardCopyIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';

import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark as oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function displayFloatStringWithPrecision(floatString, precision) {
  if (floatString === null) return '';
  return parseFloat(floatString).toFixed(precision);
}

function parseThinkingToken(t) {
  if (t === null) return '';
  if (typeof t === 'string') {
    // send an alert if a <think> tag is found
    // Replace all occurrences of <think></think> with a <span> with color="red"
    const regex = /<think>([\s\S]*?)<\/think>/g;
    return t.replace(regex, (_, thinkingText) => {
      return `<div class="chatBubbleThinking">
${thinkingText}
</div>`;
    });
  }
  return t;
}

export default function ChatBubble({
  t,
  chat,
  chatId,
  pos,
  isThinking = false,
  hide = false,
  deleteChat = (key) => {},
  regenerateLastMessage = () => {},
  isLastMessage = false,
}) {
  const tWithThinking = parseThinkingToken(t);
  return (
    <div
      style={{
        display: hide ? 'none' : 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '100%',

        padding: '10px',
        paddingLeft: '22px',
        paddingRight: '18px',
        paddingBottom: '8px',

        // backgroundColor:
        //   pos === 'bot'
        //     ? 'var(--joy-palette-neutral-100)'
        //     : 'var(--joy-palette-primary-400)',

        borderLeft:
          pos === 'bot' ? '2px solid var(--joy-palette-neutral-500)' : 'none',

        // marginLeft: pos === 'human' ? 'auto' : '0',
        // borderRadius: '20px',
      }}
      className="chatBubble"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',

          color:
            pos === 'bot'
              ? 'var(--joy-palette-text-primary)'
              : 'var(--joy-palette-text-tertiary)',

          justifyContent: pos === 'bot' ? 'left' : 'left',
          textAlign: pos === 'bot' ? 'left' : 'left',
        }}
        className="chatBubbleContent"
      >
        {pos === 'human' && !isThinking && (
          <div>
            <Markdown
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
            >
              {t}
            </Markdown>
          </div>
        )}
        {pos === 'tool' && !isThinking && (
          <div>
            <code>
              <Markdown
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
              >
                {t}
              </Markdown>
            </code>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            //marginRight: pos === 'bot' ? '15px' : '0',
            //marginLeft: pos === 'human' ? '15px' : '0',
          }}
        >
          {/* <Avatar
            sx={{
              float: 'left',
            }}
            size="sm"
          >
            {pos === 'bot' ? <BotIcon /> : <UserCircleIcon />}
          </Avatar> */}
        </div>
        {pos === 'bot' && !isThinking && (
          <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <Markdown
              rehypePlugins={[rehypeRaw]}
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
            >
              {tWithThinking}
            </Markdown>
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
          bottom: '13px',
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
                <a>ttft:</a>
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
                ? 'var(--joy-palette-neutral-500)'
                : 'var(--joy-palette-neutral-500)'
            }
            size="20px"
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
                ? 'var(--joy-palette-neutral-500)'
                : 'var(--joy-palette-neutral-500)'
            }
            size="20px"
            className="hoverIcon showOnChatBubbleHover"
            onClick={() => deleteChat(chatId)}
          />
        </span>
        {isLastMessage && pos == 'bot' && (
          <>
            &nbsp;&nbsp;
            <span>
              <RotateCcwIcon
                color={
                  pos === 'bot'
                    ? 'var(--joy-palette-neutral-500)'
                    : 'var(--joy-palette-neutral-500)'
                }
                size="20px"
                className="hoverIcon showOnChatBubbleHover"
                onClick={() => regenerateLastMessage()}
              />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
