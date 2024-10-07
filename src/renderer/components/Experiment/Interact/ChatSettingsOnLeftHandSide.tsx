import { Box, Button, FormControl, Sheet } from '@mui/joy';
import { useState } from 'react';
import MainGenerationConfigKnobs from './MainGenerationConfigKnobs';
import PreviousMessageList from './PreviousMessageList';
import PromptSettingsModal from './PromptSettingsModal';

export default function ChatSettingsOnLeftHandSide({
  generationParameters,
  setGenerationParameters,
  tokenCount,
  defaultPromptConfigForModel,
  conversations,
  conversationsIsLoading,
  conversationsMutate,
  setChats,
  setConversationId,
  conversationId,
  experimentInfo,
  experimentInfoMutate,
  showPreviousMessages = true,
}) {
  const [showPromptSettingsModal, setShowPromptSettingsModal] = useState(false);
  return (
    <>
      <Box
        id="right-hand-panel-of-chat-page"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          flex: '0 0 300px',
          justifyContent: 'space-between',
          overflow: 'hidden',
          height: '100%',
          xborder: '1px solid #ccc',
          paddingBottom: 1,
        }}
      >
        <Sheet
          id="chat-settings-on-right"
          variant="plain"
          sx={{
            // borderRadius: "md",
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 50%',
            justifyContent: 'flex-start',
            overflow: 'hidden',
            height: '100%',
            // border: '4px solid green',
          }}
        >
          <Box
            sx={{
              overflow: 'hidden',
              padding: 3,
              display: 'flex',
            }}
          >
            <FormControl>
              <MainGenerationConfigKnobs
                generationParameters={generationParameters}
                setGenerationParameters={setGenerationParameters}
                tokenCount={tokenCount}
                defaultPromptConfigForModel={defaultPromptConfigForModel}
                showAllKnobs={false}
              />
              <Button
                variant="soft"
                onClick={() => {
                  setShowPromptSettingsModal(true);
                }}
              >
                All Generation Settings
              </Button>
            </FormControl>
          </Box>
        </Sheet>
        {showPreviousMessages && (
          <PreviousMessageList
            conversations={conversations}
            conversationsIsLoading={conversationsIsLoading}
            conversationsMutate={conversationsMutate}
            setChats={setChats}
            setConversationId={setConversationId}
            conversationId={conversationId}
            experimentInfo={experimentInfo}
          />
        )}
      </Box>

      {/* <Box sx={{ borderRight: '0.5px solid #ccc', display: 'flex' }}></Box> */}
      {/* The following Sheet covers up the page if no model is running */}
      <PromptSettingsModal
        open={showPromptSettingsModal}
        setOpen={setShowPromptSettingsModal}
        defaultPromptConfigForModel={defaultPromptConfigForModel}
        generationParameters={generationParameters}
        setGenerationParameters={setGenerationParameters}
        tokenCount={tokenCount}
        experimentInfo={experimentInfo}
        experimentInfoMutate={experimentInfoMutate}
      />
    </>
  );
}
