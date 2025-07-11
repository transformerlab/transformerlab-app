import {
  Box,
  Button,
  FormLabel,
  FormControl,
  Sheet,
  Textarea,
  Typography,
} from '@mui/joy';
import { useState } from 'react';
import useSWR from 'swr';
import MainGenerationConfigKnobs from './MainGenerationConfigKnobs';
import PreviousMessageList from './PreviousMessageList';
import PromptSettingsModal from './PromptSettingsModal';
import AddMCPServerDialog from './AddMCPServerDialog';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

const fetchToolsWithMcp = async () => {
  try {
    // Fetch MCP_SERVER config
    const configResp = await fetch(
      chatAPI.getAPIFullPath('config', ['get'], { key: 'MCP_SERVER' }),
    );
    if (!configResp.ok) {
      console.error(
        'Config fetch failed:',
        configResp.status,
        configResp.statusText,
      );
      throw new Error(`HTTP error! status: ${configResp.status}`);
    }

    const configData = await configResp.json();

    let mcp_server_file = '';
    let mcp_args = '';
    let mcp_env = '';

    if (configData) {
      try {
        const parsed = JSON.parse(configData);
        mcp_server_file = parsed.serverName || '';
        mcp_args = parsed.args || '';
        mcp_env = parsed.env || '';
      } catch (parseError) {
        console.error('Error parsing config data:', parseError);
      }
    }

    // Build tools list URL
    let url = chatAPI.Endpoints.Tools.List();
    if (mcp_server_file) {
      url += `?mcp_server_file=${encodeURIComponent(mcp_server_file)}`;
      if (mcp_args) {
        url += `&mcp_args=${encodeURIComponent(mcp_args)}`;
      }
      if (mcp_env) {
        url += `&mcp_env=${encodeURIComponent(mcp_env)}`;
      }
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error('Tools fetch failed:', resp.status, resp.statusText);
      throw new Error(`HTTP error! status: ${resp.status}`);
    }

    return resp.json();
  } catch (error) {
    console.error('Error in fetchToolsWithMcp:', error);
    // Return empty array on error to prevent SWR from failing
    return [];
  }
};

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
  enableTools = false,
  showPreviousMessages = true,
}) {
  const [showPromptSettingsModal, setShowPromptSettingsModal] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Get a list of tools to display
  // const { data: available_tools } = useSWR(
  //   chatAPI.Endpoints.Tools.List(),
  //   fetcher,
  // );
  const { data: available_tools, mutate: mutateTools } = useSWR(
    'tools-list-with-mcp',
    fetchToolsWithMcp,
  );
  const tool_list =
    Array.isArray(available_tools) &&
    available_tools
      .map(function (elem) {
        return elem.name;
      })
      .join('\n');

  // console.log('Available tools:', available_tools);
  // console.log('Tool list:', tool_list);

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
          {enableTools && (
            <>
              <FormLabel>Available Tools</FormLabel>
              {tool_list && tool_list.length > 0 ? (
                <Textarea
                  value={tool_list}
                  readOnly
                  minRows={2}
                  maxRows={10}
                  sx={{
                    mb: 1,
                    resize: 'none',
                    '&:focus-visible': {
                      outline: 'none',
                    },
                  }}
                />
              ) : (
                <Typography
                  level="body-sm"
                  sx={{ color: 'text.secondary', mb: 1, pl: 1 }}
                >
                  No tools available. Add an MCP server to enable tools.
                </Typography>
              )}
              <Button onClick={() => setAddDialogOpen(true)} sx={{ mb: 1 }}>
                Add MCP Server
              </Button>
              <AddMCPServerDialog
                open={addDialogOpen}
                onClose={() => setAddDialogOpen(false)}
                onInstalled={() => {
                  mutateTools();
                }}
              />
            </>
          )}
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
