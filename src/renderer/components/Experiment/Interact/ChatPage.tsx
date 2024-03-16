import {
  Button,
  FormControl,
  FormLabel,
  Sheet,
  Stack,
  Textarea,
} from '@mui/joy';
import ChatBubble from './ChatBubble';
import ChatSubmit from './ChatSubmit';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';

export default function ChatPage({
  chats,
  setChats,
  experimentInfo,
  isThinking,
  sendNewMessageToLLM,
  experimentInfoMutate,
  tokenCount,
  text,
  debouncedText,
}) {
  const [systemMessage, setSystemMessage] = useState(
    experimentInfo?.config?.prompt_template?.system_message
  );

  const sendSystemMessageToServer = (message) => {
    // console.log(`Sending message: ${message} to the server`);
    const experimentId = experimentInfo?.id;
    const newSystemPrompt = message;

    var newPrompt = {
      ...experimentInfo?.config?.prompt_template,
    };
    newPrompt.system_message = newSystemPrompt;

    fetch(chatAPI.SAVE_EXPERIMENT_PROMPT_URL(experimentId), {
      method: 'POST',
      body: JSON.stringify(newPrompt),
    }).then((response) => {
      experimentInfoMutate();
    });
  };

  const [debouncedSystemMessage] = useDebounce(systemMessage, 1000);

  useEffect(() => {
    if (
      debouncedSystemMessage !==
      experimentInfo?.config?.prompt_template?.system_message
    ) {
      sendSystemMessageToServer(systemMessage);
    }
  }, [debouncedSystemMessage]); // useEffect will be called whenever systemMessage changes

  // Delete a chat from state array with key provided:
  const deleteChat = (key) => {
    setChats((c) => c.filter((chat) => chat.key !== key));
  };

  const clearHistory = () => {
    setChats([]);
  };

  const regenerateLastMessage = () => {
    const lastMessage = chats[chats.length - 2];
    setChats((c) => c.slice(0, -2));
    sendNewMessageToLLM(lastMessage.t);
  };

  return (
    <Sheet
      id="chat-window"
      sx={{
        borderRadius: 'md',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        flex: 'auto',
        justifyContent: 'space-evenly',
      }}
    >
      <FormLabel sx={{ justifyContent: 'space-between', width: '100%' }}>
        <span>System message</span>
        <span></span>
      </FormLabel>
      <Sheet
        variant="outlined"
        id="system-message-box"
        sx={{
          width: '100%',
          // borderRadius: "md",
          flex: '0 0 130px',
          overflow: 'auto',
          padding: 2,
        }}
      >
        <FormControl>
          <Textarea
            variant="plain"
            name="system-message"
            minRows={2}
            value={systemMessage}
            onChange={(e) => setSystemMessage(e.target.value)}
            sx={{
              '--Textarea-focusedThickness': '0',
              '--Textarea-focusedHighlight': 'transparent !important',
            }}
          />
        </FormControl>
      </Sheet>
      <Sheet
        variant="plain"
        sx={{
          width: '100%',
          // borderRadius: "md",
          flex: '99',
          overflow: 'auto',
          padding: 1,
        }}
      >
        {/* {JSON.stringify(chats)} */}
        <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column' }}>
          {chats.map((chat, i) => (
            <>
              <ChatBubble
                t={chat.t}
                chat={chat}
                chatId={chat.key}
                pos={chat.user}
                key={chat.key}
                deleteChat={deleteChat}
                regenerateLastMessage={regenerateLastMessage}
                isLastMessage={i === chats.length - 1}
              />
            </>
          ))}
        </Stack>
        {/* This is a placeholder for the bot's response. sendMessageToLLM writes directly to this chat bubble */}
        <ChatBubble
          isThinking
          chatId="thinking"
          hide={!isThinking}
          t="Thinking..."
          pos="bot"
          key={'thinking'}
          chat={undefined}
        />

        <div id="endofchat" />
      </Sheet>
      <ChatSubmit
        addMessage={sendNewMessageToLLM}
        spinner={isThinking}
        clearHistory={clearHistory}
        tokenCount={tokenCount}
        text={text}
        debouncedText={debouncedText}
      />
    </Sheet>
  );
}
