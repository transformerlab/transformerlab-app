import {
  Button,
  FormControl,
  FormLabel,
  Sheet,
  Stack,
  Textarea,
  Box,
  Modal,
  ModalDialog,
} from '@mui/joy';
import ChatBubble from './ChatBubble';
import ChatSubmit from './ChatSubmit';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';
import useSWR from 'swr';
import SystemMessageBox from './SystemMessageBox';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ChatPage({
  chats,
  setChats,
  experimentInfo,
  isThinking,
  sendNewMessageToLLM,
  stopStreaming,
  experimentInfoMutate,
  tokenCount,
  text,
  debouncedText,
  defaultPromptConfigForModel = {},
  enableTools = false,
  currentModelArchitecture,
}) {
  const [image, setImage] = useState(null); //This is mostly used for the modal. The actual image is stored in the chats array
  const [imageModalOpen, setImageModalOpen] = useState(false);

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

  // Get a list of tools to display
  const {
    data: available_tools
  } = useSWR(
    chatAPI.Endpoints.Tools.List(),
    fetcher
  );
  const tool_list = Array.isArray(available_tools)
    && available_tools.map(function(elem){
      return elem.name;
    }).join("\n");

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
        overflow: 'hidden',
      }}
    >
      {enableTools &&
      <>
        <FormLabel>Available Tools</FormLabel>
        <Textarea value={tool_list} />
      </>
      }
      {!enableTools &&
      <SystemMessageBox
        experimentInfo={experimentInfo}
        experimentInfoMutate={experimentInfoMutate}
        defaultPromptConfigForModel={defaultPromptConfigForModel}
      />
      }
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
        <Stack spacing={0} sx={{ display: 'flex', flexDirection: 'column' }}>
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
              {chat.image && (
                <Box
                  component="img"
                  src={chat.image}
                  onClick={() => {
                    setImageModalOpen(true);
                    setImage(chat.image);
                  }}
                  sx={{
                    position: 'relative',
                    display: 'inline-block',
                    maxWidth: '200px',
                    maxHeight: '200px',
                    width: 'auto',
                    height: 'auto',
                    flexShrink: 1,
                    overflow: 'hidden',
                    marginRight: '10px',
                  }}
                  alt="uploaded"
                />
              )}
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
        stopStreaming={stopStreaming}
        spinner={isThinking}
        clearHistory={clearHistory}
        tokenCount={tokenCount}
        text={text}
        debouncedText={debouncedText}
        currentModelArchitecture={currentModelArchitecture}
      />
      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
        <ModalDialog
          sx={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            width: 'auto',
            height: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            component="img"
            src={image}
            sx={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
            }}
            alt="uploaded large"
          />
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
