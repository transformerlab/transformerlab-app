/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';
import useSWR from 'swr';

import {
  Sheet,
  FormControl,
  FormLabel,
  Button,
  Slider,
  Typography,
  Radio,
  RadioGroup,
  Box,
  List,
  ListItem,
  ListDivider,
  ListItemDecorator,
  ListItemContent,
  ListItemButton,
  IconButton,
  Alert,
} from '@mui/joy';

import ChatPage from './ChatPage';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';

import './styles.css';

import { useDebounce } from 'use-debounce';
import CompletionsPage from './CompletionsPage';
import { MessagesSquareIcon, XIcon } from 'lucide-react';
import PromptSettingsModal from './PromptSettingsModal';
import MainGenerationConfigKnobs from './MainGenerationConfigKnobs';

function scrollChatToBottom() {
  // We animate it twice, the second time to accomodate the scale up transition
  // I find this looks better than one later scroll
  setTimeout(() => document.getElementById('endofchat')?.scrollIntoView(), 100);
  setTimeout(() => document.getElementById('endofchat')?.scrollIntoView(), 400);
}

function shortenArray(arr, maxLen) {
  if (!arr) return [];
  if (arr.length <= maxLen) {
    return arr;
  }
  return arr.slice(0, maxLen - 1).concat('...');
}

function truncate(str, n) {
  if (!str) return '';

  return str.length > n ? <>{str.slice(0, n - 1)} &hellip;</> : <>{str}</>;
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Chat({ experimentInfo, experimentInfoMutate }) {
  const { models, isError, isLoading } = chatAPI.useModelStatus();
  const [mode, setMode] = React.useState('chat');
  const [conversationId, setConversationId] = React.useState(null);
  const [chats, setChats] = React.useState([]);
  const [isThinking, setIsThinking] = React.useState(false);
  const [generationParameters, setGenerationParameters] = React.useState({
    temperature: 0.7,
    maxTokens: 256,
    topP: 1,
    frequencyPenalty: 0,
  });
  const [showPromptSettingsModal, setShowPromptSettingsModal] =
    React.useState(false);

  const [text, setText] = React.useState('');

  const { data: defaultPromptConfigForModel } = useSWR(
    chatAPI.TEMPLATE_FOR_MODEL_URL(experimentInfo?.config?.foundation),
    fetcher
  );

  const parsedPromptData = experimentInfo?.config?.prompt_template;

  var textToDebounce = '';

  // The following code, when in chat mode, will try to create a fake string
  // that roughly represents the chat as a long prompt. But this is a hack:
  // If we really want count tokens accurately, we need to pass the system
  // message and messages to the server and let it format the prompt as per
  // the moel's template. More info here: https://huggingface.co/docs/transformers/main/en/chat_templating
  // For now this is helpful a rough indicator of the number of tokens used.
  // But we should improve this later
  if (mode === 'chat') {
    textToDebounce += experimentInfo?.config?.prompt_template?.system_message;
    textToDebounce += '\n';
    chats.forEach((c) => {
      textToDebounce += c.t;
    });
  } else {
    textToDebounce = text;
  }

  const [debouncedText] = useDebounce(textToDebounce, 1000);

  const [tokenCount, setTokenCount] = React.useState({});

  const currentModel = experimentInfo?.config?.foundation;
  const adaptor = experimentInfo?.config?.adaptor;

  React.useEffect(() => {
    if (debouncedText) {
      if (mode === 'chat') {
        countChatTokens();
      } else {
        countTokens();
      }
    }
  }, [debouncedText]);

  // If the model changes, check the location of the inference service
  // And reset the global pointer to the inference server
  React.useEffect(() => {
    if (!window.TransformerLab) {
      window.TransformerLab = {};
    }
    if (models?.[0]?.location) {
      window.TransformerLab.inferenceServerURL = models?.[0]?.location;
    } else {
      window.TransformerLab.inferenceServerURL = null;
    }
  }, [models]);

  React.useMemo(() => {
    const asyncTasks = async () => {
      const result = await chatAPI.getTemplateForModel(currentModel);
      const t = result?.system_message;

      const parsedPromptData =
        experimentInfo?.config?.prompt_template?.system_message;

      if (parsedPromptData && document.getElementsByName('system-message')[0]) {
        document.getElementsByName('system-message')[0].value =
          parsedPromptData;
      } else if (t) {
        if (document.getElementsByName('system-message')[0])
          document.getElementsByName('system-message')[0].value = t;
      } else {
        if (document.getElementsByName('system-message')[0]) {
          document.getElementsByName('system-message')[0].value =
            'You are a helpful chatbot';
        }
      }

      const startingChats = [];

      result?.messages.forEach((m) => {
        if (m[0] === 'Human') {
          startingChats.push({ t: m[1], user: 'human', key: Math.random() });
        } else {
          startingChats.push({ t: m[1], user: 'bot', key: Math.random() });
        }
      });

      // We will ignore the FastChat starting chats for now. If you uncomment
      // the following line, you will see a starting conversation.
      //setChats(startingChats);

      scrollChatToBottom();
    };

    if (!currentModel) return;

    asyncTasks();
  }, [currentModel, adaptor, experimentInfo?.config?.prompt_template]);

  const sendNewMessageToLLM = async (text: String) => {
    const r = Math.floor(Math.random() * 1000000);

    // Create a new chat for the user's message
    var newChats = [...chats, { t: text, user: 'human', key: r }];

    // Add Message to Chat Array:
    setChats((c) => [...c, { t: text, user: 'human', key: r }]);
    scrollChatToBottom();

    const timeoutId = setTimeout(() => {
      setIsThinking(true);

      scrollChatToBottom();
    }, 100);

    const systemMessage =
      document.getElementsByName('system-message')[0]?.value;

    // Get a list of all the existing chats so we can send them to the LLM
    let texts = chats.map((c) => {
      return {
        role: c.user === 'bot' ? 'user' : 'assistant',
        content: c.t ? c.t : '',
      };
    });

    // Add the user's message
    texts.push({ role: 'user', content: text });

    // Send them over
    const result = await chatAPI.sendAndReceiveStreaming(
      currentModel,
      adaptor,
      texts,
      generationParameters?.temperature,
      generationParameters?.maxTokens,
      generationParameters?.topP,
      generationParameters?.frequencyPenalty,
      systemMessage
    );

    clearTimeout(timeoutId);
    setIsThinking(false);
    // Add Response to Chat Array:

    let numberOfTokens = await chatAPI.countTokens(currentModel, [
      result?.text,
    ]);
    numberOfTokens = numberOfTokens?.tokenCount;
    console.log('Number of Tokens: ', numberOfTokens);
    console.log(result);
    const timeToFirstToken = result?.timeToFirstToken;
    const tokensPerSecond = (numberOfTokens / parseFloat(result?.time)) * 1000;

    newChats = [...newChats, { t: result?.text, user: 'bot', key: result?.id }];

    setChats((c) => [
      ...c,
      {
        t: result?.text,
        user: 'bot',
        key: result?.id,
        numberOfTokens: numberOfTokens,
        timeToFirstToken: timeToFirstToken,
        tokensPerSecond: tokensPerSecond,
      },
    ]);

    var cid = conversationId;
    const experimentId = experimentInfo?.id;

    if (cid == null) {
      cid = Math.random().toString(36).substring(7);
      setConversationId(cid);
    }

    //save the conversation to the server
    fetch(chatAPI.Endpoints.Experiment.SaveConversation(experimentId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: cid,
        conversation: JSON.stringify(newChats),
      }),
    }).then((response) => {
      conversationsMutate();
    });

    scrollChatToBottom();

    return result?.text;
  };

  // Get all conversations for this experiment
  const {
    data: conversations,
    error: conversationsError,
    isLoading: conversationsIsLoading,
    mutate: conversationsMutate,
  } = useSWR(
    chatAPI.Endpoints.Experiment.GetConversations(experimentInfo?.id),
    fetcher
  );

  const sendCompletionToLLM = async (element) => {
    const text = element.value;

    setIsThinking(true);

    var inferenceParams = '';

    if (experimentInfo?.config?.inferenceParams) {
      inferenceParams = experimentInfo?.config?.inferenceParams;
      inferenceParams = JSON.parse(inferenceParams);
    }

    console.log(inferenceParams);

    const isVLLMInferenceEngine =
      inferenceParams?.inferenceEngine === 'vllm_server';

    console.log('WE ARE USING VLLM SERVER: ', isVLLMInferenceEngine);

    const result = await chatAPI.sendCompletion(
      currentModel,
      adaptor,
      text,
      generationParameters?.temperature,
      generationParameters?.maxTokens,
      generationParameters?.topP,
      false
    );
    setIsThinking(false);

    if (result?.text) element.value += result.text;
  };

  async function countTokens() {
    var count = await chatAPI.countTokens(currentModel, [debouncedText]);
    setTokenCount(count);
  }

  async function countChatTokens() {
    const systemMessage =
      document.getElementsByName('system-message')[0]?.value;

    let texts = chats.map((c) => {
      return {
        role: c.user === 'human' ? 'user' : 'assistant',
        content: c.t ? c.t : '',
      };
    });

    texts.push({ role: 'user', content: debouncedText });

    var count = await chatAPI.countChatTokens(currentModel, texts);

    setTokenCount(count);
  }

  if (!experimentInfo) return 'Select an Experiment';

  return (
    <>
      <Sheet
        id="interact-page"
        sx={{
          display: 'flex',
          height: '100%',
          paddingBottom: 4,
          flexDirection: 'row',
          gap: 3,
        }}
      >
        <Sheet
          sx={{
            position: 'absolute',
            top: '0%',
            left: '0%',
            height: '90dvh',
            width: '80dvw',
            zIndex: 10000,
            backgroundColor: 'var(--joy-palette-neutral-softBg)',
            opacity: 0.9,
            borderRadius: 'md',
            padding: 2,
            visibility: !models?.[0]?.id ? 'visible' : 'hidden',
          }}
        >
          <Alert
            sx={{ position: 'relative', top: '50%', justifyContent: 'center' }}
          >
            No Model is Running
          </Alert>
        </Sheet>
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
        {/* <pre>{JSON.stringify(chats, null, 2)}</pre> */}
        {mode === 'chat' && (
          <ChatPage
            key={conversationId}
            chats={chats}
            setChats={setChats}
            experimentInfo={experimentInfo}
            isThinking={isThinking}
            sendNewMessageToLLM={sendNewMessageToLLM}
            experimentInfoMutate={experimentInfoMutate}
            tokenCount={tokenCount}
            text={textToDebounce}
            debouncedText={debouncedText}
          />
        )}
        {mode === 'completions' && (
          <CompletionsPage
            text={text}
            setText={setText}
            debouncedText={debouncedText}
            tokenCount={tokenCount}
            isThinking={isThinking}
            sendCompletionToLLM={sendCompletionToLLM}
          />
        )}
        <Box
          id="right-hand-panel-of-chat-page"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            flex: '0 0 300px',
            justifyContent: 'space-between',
            overflow: 'hidden',
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
              xpadding: 2,
              justifyContent: 'flex-start',
              overflow: 'hidden',
              // border: '4px solid green',
            }}
          >
            <Typography level="h2" fontSize="lg" id="card-description" mb={3}>
              {currentModel} - {adaptor}
            </Typography>
            <FormControl>
              <FormLabel sx={{ fontWeight: '600' }}>Mode:</FormLabel>
              <RadioGroup
                orientation="horizontal"
                aria-labelledby="segmented-controls-example"
                name="mode"
                value={mode}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setMode(event.target.value)
                }
                sx={{
                  minHeight: 48,
                  padding: '4px',
                  borderRadius: '12px',
                  bgcolor: 'neutral.softBg',
                  '--RadioGroup-gap': '4px',
                  '--Radio-actionRadius': '8px',
                  justifyContent: 'space-evenly',
                }}
              >
                {['chat', 'completions'].map((item) => (
                  <Radio
                    key={item}
                    color="neutral"
                    value={item}
                    disableIcon
                    label={item}
                    variant="plain"
                    sx={{
                      px: 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexGrow: 1,
                    }}
                    slotProps={{
                      label: { style: { textAlign: 'center' } },
                      action: ({ checked }) => ({
                        sx: {
                          ...(checked && {
                            bgcolor: 'background.surface',
                            boxShadow: 'sm',
                            '&:hover': {
                              bgcolor: 'background.surface',
                            },
                          }),
                        },
                      }),
                    }}
                  />
                ))}
              </RadioGroup>
            </FormControl>
            <Box sx={{ overflow: 'auto', width: '100%', padding: 3 }}>
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
          <Sheet
            sx={{
              display: 'flex',
              flex: '2',
              // border: '4px solid red',
              flexDirection: 'column',
              overflow: 'hidden',
              justifyContent: 'flex-end',
            }}
          >
            <Sheet
              sx={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'auto',
                width: '100%',
              }}
              variant="outlined"
            >
              <List>
                {conversationsIsLoading && <div>Loading...</div>}
                {conversations &&
                  conversations?.map((c) => {
                    return (
                      <div key={c?.id}>
                        <ListItem>
                          <ListItemButton
                            onClick={() => {
                              setChats(c?.contents);
                              setConversationId(c?.id);
                            }}
                            selected={conversationId === c?.id}
                          >
                            <ListItemDecorator>
                              <MessagesSquareIcon />
                            </ListItemDecorator>
                            <ListItemContent>
                              <Typography level="title-md">{c?.id}</Typography>
                              <Typography level="body-sm">
                                {c?.contents?.length > 0 &&
                                  shortenArray(c?.contents, 3).map((m) => {
                                    return (
                                      <>
                                        {m?.user == 'human' ? 'User' : 'Bot'}:
                                        &nbsp;
                                        {truncate(m?.t, 20)}
                                        <br />
                                      </>
                                    );
                                  })}
                              </Typography>
                            </ListItemContent>
                            <IconButton
                              onClick={() => {
                                fetch(
                                  chatAPI.Endpoints.Experiment.DeleteConversation(
                                    experimentInfo?.id,
                                    c?.id
                                  ),
                                  {
                                    method: 'DELETE',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                  }
                                ).then((response) => {
                                  conversationsMutate();
                                });
                              }}
                            >
                              <XIcon />
                            </IconButton>
                          </ListItemButton>
                        </ListItem>
                        <ListDivider />
                      </div>
                    );
                  })}
              </List>
            </Sheet>
            <Button
              variant="soft"
              onClick={() => {
                setChats([]);
                setConversationId(null);
                conversationsMutate();
              }}
            >
              New Conversation
            </Button>
          </Sheet>
        </Box>
      </Sheet>
    </>
  );
}
