import {
  Alert,
  FormLabel,
  Sheet,
  Stack,
  Textarea,
  Box,
  Modal,
  ModalDialog,
} from '@mui/joy';
import {
  ConstructionIcon,
} from 'lucide-react';

import ChatBubble from './ChatBubble';
import ChatSubmit from './ChatSubmit';
import ChatSettingsOnLeftHandSide from './ChatSettingsOnLeftHandSide';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import SystemMessageBox from './SystemMessageBox';

import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';

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
  generationParameters,
  setGenerationParameters,
  conversations,
  conversationsIsLoading,
  conversationsMutate,
  setConversationId,
  conversationId,
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
      sx={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        gap: 2,
      }}
      id="chat-surrounding"
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
        enableTools={enableTools}
      />
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
          height: '100%',
        }}
      >
        {enableTools && (
          <Alert
          variant="outlined"
          color="warning"
          startDecorator={<ConstructionIcon />}
        >
          Work In Progress.
          This is a preview of tool calling.
          We will be expanding this portion of the app in an upcoming release.
          This feature will allow a user to add functions that can be 
          called by the model.
          For now, there is a static set of default tools you can test.
        </Alert>
        )}
        {!enableTools && (
          <SystemMessageBox
            experimentInfo={experimentInfo}
            experimentInfoMutate={experimentInfoMutate}
            defaultPromptConfigForModel={defaultPromptConfigForModel}
          />
        )}
        <Sheet
          variant="plain"
          sx={{
            width: '100%',
            // borderRadius: "md",
            height: '100%',
            overflow: 'auto',
            padding: 1,
            display: 'flex',
            flexDirection: 'column',
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
    </Sheet>
  );
}
