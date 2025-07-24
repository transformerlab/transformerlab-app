import {
  Box,
  Button,
  FormLabel,
  FormControl,
  Sheet,
  Textarea,
  Typography,
} from '@mui/joy';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import MainGenerationConfigKnobs from './MainGenerationConfigKnobs';
import PreviousMessageList from './PreviousMessageList';
import PromptSettingsModal from './PromptSettingsModal';
import { Modal, ModalDialog, ModalClose } from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

const fetchToolsWithMcp = async () => {
  // 1. load ~/.transformerlab/mcp.json
  const cfgResp = await fetch(chatAPI.Endpoints.MCP.ConfigGet());
  const cfg = await cfgResp.json();

  // 2. build active‑list from server IDs present in the file
  const activeIds = Object.keys(cfg.servers || {});
  if (activeIds.length === 0) return [];

  // 3. call /mcp/list
  const url = chatAPI.Endpoints.MCP.List(activeIds);
  const listResp = await fetch(url);
  if (!listResp.ok) throw new Error(await listResp.text());
  return listResp.json();
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
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false);
  const [mcpJson, setMcpJson] = useState('');

  useEffect(() => {
    if (mcpEditorOpen) {
      fetch(chatAPI.Endpoints.MCP.ConfigGet())
        .then((res) => res.json())
        .then((data) => {
          setMcpJson(JSON.stringify(data, null, 2));
        })
        .catch(() => setMcpJson('{}'));
    }
  }, [mcpEditorOpen]);

  const handleEditorDidMount = (editor, monaco) => {};
  const handleEditorChange = (value) => setMcpJson(value);
  const handleSaveMcpJson = async () => {
    try {
      const response = await fetch(chatAPI.Endpoints.MCP.ConfigSet(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: mcpJson,
      });
      if (!response.ok) {
        let errorText = await response.text();
        alert('Failed to save MCP config: ' + errorText);
        return;
      }
      alert('MCP config saved successfully!');
      setMcpEditorOpen(false);
      mutateTools();
    } catch (error) {
      alert('Error saving MCP config.');
    }
  };

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
              <Button onClick={() => setMcpEditorOpen(true)} sx={{ mb: 1 }}>
                Configure MCP Servers
              </Button>

              {mcpEditorOpen && (
                <Modal
                  open={mcpEditorOpen}
                  onClose={() => setMcpEditorOpen(false)}
                >
                  <ModalDialog
                    sx={{
                      minWidth: '70vw',
                      minHeight: '60vh',
                      overflow: 'auto',
                    }}
                  >
                    <ModalClose onClick={() => setMcpEditorOpen(false)} />
                    <Typography level="h4" sx={{ mb: 2 }}>
                      Edit MCP Servers JSON
                    </Typography>
                    <Box sx={{ height: '50vh', width: '100%', mb: 2 }}>
                      <Editor
                        defaultLanguage="json"
                        theme="my-theme"
                        height="100%"
                        width="100%"
                        value={mcpJson}
                        onMount={handleEditorDidMount}
                        onChange={handleEditorChange}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          wordWrap: 'on',
                        }}
                      />
                    </Box>
                    <Box
                      display="flex"
                      flexDirection="row"
                      gap={1}
                      justifyContent="flex-end"
                    >
                      <Button onClick={handleSaveMcpJson} color="success">
                        Save
                      </Button>
                      <Button
                        variant="plain"
                        color="danger"
                        onClick={() => setMcpEditorOpen(false)}
                      >
                        Cancel
                      </Button>
                    </Box>
                  </ModalDialog>
                </Modal>
              )}
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
