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
import { CheckIcon, PencilIcon } from 'lucide-react';

export default function ChatPage({
  chats,
  setChats,
  templateTextIsEditable,
  experimentInfo,
  isThinking,
  sendNewMessageToLLM,
  experimentInfoMutate,
  setTemplateTextIsEditable,
  tokenCount,
  text,
  debouncedText,
}) {
  // Delete a chat from state array with key provided:
  const deleteChat = (key) => {
    setChats((c) => c.filter((chat) => chat.key !== key));
  };

  const clearHistory = () => {
    setChats([]);
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
          <FormLabel sx={{ justifyContent: 'space-between', width: '100%' }}>
            <span>System message</span>
            <span>
              {' '}
              {templateTextIsEditable ? (
                <Button
                  variant="soft"
                  startDecorator={<CheckIcon />}
                  onClick={() => {
                    const experimentId = experimentInfo?.id;
                    const newSystemPrompt =
                      document.getElementsByName('system-message')[0]?.value;

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

                    setTemplateTextIsEditable(!templateTextIsEditable);
                  }}
                  size="sm"
                >
                  Save Changes
                </Button>
              ) : (
                <PencilIcon
                  size={18}
                  onClick={() =>
                    setTemplateTextIsEditable(!templateTextIsEditable)
                  }
                  color={templateTextIsEditable ? '#aaa' : '#000'}
                />
              )}
            </span>
          </FormLabel>
          <Textarea
            placeholder="You are a helpful chatbot"
            variant="plain"
            name="system-message"
            disabled={!templateTextIsEditable}
          />
        </FormControl>
      </Sheet>

      <Sheet
        variant="outlined"
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
          {chats.map((chat) => (
            <ChatBubble
              t={chat.t}
              chatId={chat.key}
              pos={chat.user}
              key={chat.key}
              deleteChat={deleteChat}
            />
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
