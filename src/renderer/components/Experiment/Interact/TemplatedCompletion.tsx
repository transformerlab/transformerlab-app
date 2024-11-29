import {
  Button,
  CircularProgress,
  Select,
  Sheet,
  Textarea,
  Option,
  Typography,
  FormLabel,
  Box,
  Stack,
  Chip,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  LinearProgress,
} from '@mui/joy';
import { SendIcon, PlusCircleIcon, X, XIcon } from 'lucide-react';
import { useState } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import TemplatedPromptModal from './TemplatedPromptModal';
import ChatSettingsOnLeftHandSide from './ChatSettingsOnLeftHandSide';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TemplatedCompletion({
  experimentInfo,
  tokenCount,
  generationParameters,
  setGenerationParameters,
  defaultPromptConfigForModel,
  conversations,
  conversationsIsLoading,
  conversationsMutate,
  setChats,
  setConversationId,
  conversationId,
  experimentInfoMutate,
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [timeTaken, setTimeTaken] = useState<number | null>(null);
  const [outputText, setOutputText] = useState('');
  const [currentTab, setCurrentTab] = useState(0);
  const [editTemplateModalOpen, setEditTemplateModalOpen] = useState(false);

  const { data: templates, mutate: templatesMutate } = useSWR(
    chatAPI.Endpoints.Prompts.List(),
    fetcher
  );

  const sendTemplatedCompletionToLLM = async (element, target) => {
    if (!selectedTemplate) {
      return;
    }

    const text = element.value;

    const template = selectedTemplate;

    if (!template) {
      alert('Template not found');
      return;
    }

    const completionText = template.text.replace('{text}', text);
    setOutputText('');

    setIsThinking(true);

    var inferenceParams = '';

    if (experimentInfo?.config?.inferenceParams) {
      inferenceParams = experimentInfo?.config?.inferenceParams;
      inferenceParams = JSON.parse(inferenceParams);
    }

    console.log(inferenceParams);

    const generationParamsJSON = experimentInfo?.config?.generationParams;
    const generationParameters = JSON.parse(generationParamsJSON);

    try {
      console.log(generationParameters?.stop_str);
      generationParameters.stop_str = JSON.parse(
        generationParameters?.stop_str
      );
    } catch (e) {
      console.log('Error parsing stop strings as JSON');
    }

    const result = await chatAPI.sendCompletion(
      experimentInfo?.config?.foundation,
      experimentInfo?.config?.adaptor,
      completionText,
      generationParameters?.temperature,
      generationParameters?.maxTokens,
      generationParameters?.topP,
      false,
      generationParameters?.stop_str,
      target
    );

    setOutputText(result?.text || '');
    setIsThinking(false);
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        gap: 2,
      }}
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
      />
      <TemplatedPromptModal
        open={editTemplateModalOpen}
        setOpen={setEditTemplateModalOpen}
        mutate={templatesMutate}
      />
      <Sheet
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          paddingBottom: '10px',
          height: '100%',
          justifyContent: 'space-between',
        }}
      >
        <div>
          {/* {JSON.stringify(templates)} */}
          <FormLabel>Prompt Template:</FormLabel>
          <Select
            placeholder="Select Template"
            variant="soft"
            name="template"
            value={selectedTemplate?.id}
            onChange={(e, newValue) => {
              if (newValue === 'custom') {
                setSelectedTemplate(null);
                setEditTemplateModalOpen(true);
                return;
              }
              const newSelectedTemplate = templates?.find(
                (t) => t.id === newValue
              );
              setSelectedTemplate(newSelectedTemplate);
            }}
            renderValue={(selected) => {
              const value = selected?.value;
              return (
                templates?.find((t) => t.id === value)?.title ||
                'Select Template'
              );
            }}
            required
            sx={{ minWidth: 200, marginTop: '5px' }}
          >
            {templates?.map((template) => (
              <Option key={template.id} value={template.id}>
                {template?.source !== 'local' && (
                  <Chip color="warning">gallery</Chip>
                )}
                {template?.source == 'local' && (
                  <Chip color="success">local</Chip>
                )}
                {template.title}
              </Option>
            ))}
            <Option key="new-prompt" value="custom">
              <PlusCircleIcon /> Create New Prompt
            </Option>
          </Select>
        </div>
        {selectedTemplate && (
          <>
            <Stack
              direction="row"
              sx={{
                justifyContent: 'flex-end',
                gap: '1rem',
              }}
            >
              <Typography
                level="body-xs"
                onClick={() => {
                  setShowTemplate(!showTemplate);
                }}
                sx={{
                  cursor: 'pointer',
                  color: 'primary',
                  textAlign: 'right',
                }}
              >
                {showTemplate ? 'Hide' : 'Show'}
              </Typography>
              {selectedTemplate?.source == 'local' && (
                <Typography
                  color="warning"
                  level="body-xs"
                  onClick={async () => {
                    if (!selectedTemplate) {
                      return;
                    }
                    if (
                      confirm('Are you sure you want to delete this template?')
                    ) {
                      await fetch(
                        chatAPI.Endpoints.Prompts.Delete(selectedTemplate.id)
                      );
                      templatesMutate();
                    }
                  }}
                  sx={{
                    cursor: 'pointer',
                    color: 'primary',
                    textAlign: 'right',
                  }}
                >
                  Delete
                </Typography>
              )}
            </Stack>
            {showTemplate && (
              <>
                <Sheet
                  variant="plain"
                  color="neutral"
                  sx={{
                    padding: '0 1rem',
                    maxHeight: '400px',
                    // borderLeft: '2px solid var(--joy-palette-neutral-500)',
                    overflow: 'auto',
                  }}
                >
                  <Typography level="body-md" color="neutral">
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: '14px',
                        fontFamily: 'var(--joy-fontFamily-code)',
                      }}
                    >
                      {selectedTemplate ? selectedTemplate?.text : ''}
                    </pre>
                  </Typography>
                </Sheet>
              </>
            )}

            <Sheet
              variant="outlined"
              sx={{
                flex: 1,
                overflow: 'auto',
                padding: 2,
                margin: 'auto',
                flexDirection: 'column',
                width: '100%',
              }}
            >
              <Textarea
                placeholder=""
                variant="plain"
                name="completion-text"
                minRows={4}
                sx={{
                  display: 'flex',
                  flex: 1,
                  '--Textarea-focusedThickness': '0px',
                  '& textarea': {
                    overflow: 'auto',
                  },
                }}
              />
            </Sheet>
            <Stack direction="row">
              <div>
                {timeTaken && timeTaken !== -1 && (
                  <Typography level="body-sm" color="neutral">
                    Time taken: {Math.round(timeTaken)}ms
                  </Typography>
                )}
                {timeTaken == -1 && (
                  <CircularProgress
                    size="sm"
                    thickness={1}
                    color="neutral"
                    sx={{
                      '--CircularProgress-size': '18px',
                      '--CircularProgress-trackThickness': '1px',
                      '--CircularProgress-progressThickness': '1px',
                    }}
                  />
                )}
              </div>
              <Button
                sx={{ ml: 'auto' }}
                color="neutral"
                endDecorator={
                  isThinking ? (
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
                disabled={isThinking}
                id="chat-submit-button"
                onClick={async () => {
                  setTimeTaken(-1);
                  const startTime = performance.now();

                  setCurrentTab(0);

                  document.getElementsByName('output-text')[0].value = '';
                  await sendTemplatedCompletionToLLM(
                    document.getElementsByName('completion-text')?.[0],
                    document.getElementById('completion-textarea')
                  );

                  const endTime = performance.now();
                  setTimeTaken(endTime - startTime);
                }}
              >
                {isThinking ? 'Answering' : 'Answer'}
              </Button>
            </Stack>
            <Sheet
              variant="plain"
              sx={{
                padding: '2rem 1rem',
                flex: 2,
                overflow: 'auto',
              }}
              id="completion-output"
            >
              <Tabs
                value={currentTab}
                onChange={(e, newValue) => {
                  setCurrentTab(newValue);
                }}
              >
                <TabList>
                  <Tab variant="plain" color="neutral">
                    Raw
                  </Tab>
                  <Tab disabled={isThinking}>Markdown</Tab>
                </TabList>
                <TabPanel value={0} keepMounted>
                  <Box
                    sx={
                      {
                        // paddingLeft: 2,
                        // borderLeft: '2px solid var(--joy-palette-neutral-500)',
                      }
                    }
                  >
                    <Textarea
                      name="output-text"
                      variant="plain"
                      minRows={12}
                      sx={{ height: '100%' }}
                      slotProps={{ textarea: { id: 'completion-textarea' } }}
                    ></Textarea>
                    {isThinking && <LinearProgress sx={{ width: '300px' }} />}
                    <div id="endofchat"></div>
                  </Box>
                </TabPanel>
                <TabPanel value={1} keepMounted>
                  <Box
                    sx={
                      {
                        // paddingLeft: 2,
                        // borderLeft: '2px solid var(--joy-palette-neutral-500)',
                      }
                    }
                  >
                    {isThinking && <LinearProgress sx={{ width: '300px' }} />}
                    <Markdown
                      children={outputText}
                      remarkPlugins={[remarkGfm]}
                      className="editableSheetContent"
                    ></Markdown>
                  </Box>
                </TabPanel>
              </Tabs>
            </Sheet>
          </>
        )}
      </Sheet>
    </Sheet>
  );
}
