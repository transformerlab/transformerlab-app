/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';
import useSWR from 'swr';

import {
  Sheet,
  FormControl,
  FormLabel,
  Button,
  Typography,
  Radio,
  RadioGroup,
  Box,
  Alert,
  Select,
  Option,
} from '@mui/joy';

import ChatPage from './ChatPage';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';

import './styles.css';

import { useDebounce } from 'use-debounce';
import CompletionsPage from './CompletionsPage';
import PromptSettingsModal from './PromptSettingsModal';
import MainGenerationConfigKnobs from './MainGenerationConfigKnobs';
import { FaEllipsisVertical } from 'react-icons/fa6';
import Rag from '../Rag';
import PreviousMessageList from './PreviousMessageList';
import TemplatedCompletion from './TemplatedCompletion';
import ChatBubble from './ChatBubble';
import { MessageCircleIcon } from 'lucide-react';
import Tokenize from '../Tokenize';
import Embeddings from '../Embeddings';

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

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Chat({
  experimentInfo,
  experimentInfoMutate,
  setRagEngine,
}) {
  const { models, isError, isLoading } = chatAPI.useModelStatus();
  const [mode, setMode] = React.useState('chat');
  const [conversationId, setConversationId] = React.useState(null);
  const [chats, setChats] = React.useState([]);
  const [isThinking, setIsThinking] = React.useState(false);
  const [generationParameters, setGenerationParameters] = React.useState({
    temperature: 0.7,
    maxTokens: 1024,
    topP: 1.0,
    frequencyPenalty: 0.0,
    needsReset: true,
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
  //This is necessary for assessing whether a model is multimodal or not, and whether images can be sent
  const currentModelArchitecture =
    experimentInfo?.config?.foundation_model_architecture;
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
          document.getElementsByName('system-message')[0].value = '';
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

  React.useEffect(() => {
    if (generationParameters?.needsReset) {
      // Get the generation parameters from the experiment config
      var generationParams = experimentInfo?.config?.generationParams;
      if (generationParams) {
        try {
          generationParams = JSON.parse(generationParams);
        } catch (e) {
          generationParams = {};
          console.log('Error parsing generation parameters as JSON');
        }
        setGenerationParameters(generationParams);
      } else {
        // If they don't exist, set them to some defaults
        setGenerationParameters({
          temperature: 0.7,
          maxTokens: 1024,
          topP: 1.0,
          frequencyPenalty: 0.0,
          needsReset: false,
        });
      }
    } else {
      fetch(
        chatAPI.Endpoints.Experiment.UpdateConfig(
          experimentInfo?.id,
          'generationParams',
          JSON.stringify(generationParameters)
        )
      ).then(() => {
        experimentInfoMutate();
      });
    }
  }, [generationParameters]);

  function stopStreaming() {
    chatAPI.stopStreamingResponse();
  }

  const sendNewMessageToLLM = async (text: String, image?: string) => {
    const r = Math.floor(Math.random() * 1000000);

    // Create a new chat for the user's message
    var newChats = [...chats, { t: text, user: 'human', key: r, image: image }];

    // Add Message to Chat Array:
    setChats(newChats);
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
    if (image && image !== '') {
      //Images must be sent in this format for fastchat
      texts.push({
        role: 'user',
        content: [
          { type: 'text', text: text },
          { type: 'image_url', image_url: image },
        ],
      });
      //texts.push({ role: 'user', content: { image } });
    } else {
      texts.push({ role: 'user', content: text });
    }

    const generationParamsJSON = experimentInfo?.config?.generationParams;
    const generationParameters = JSON.parse(generationParamsJSON);

    try {
      generationParameters.stop_str = JSON.parse(
        generationParameters?.stop_str
      );
    } catch (e) {
      console.log('Error parsing stop strings as JSON');
    }

    // Send them over
    const result = await chatAPI.sendAndReceiveStreaming(
      currentModel,
      adaptor,
      texts,
      generationParameters?.temperature,
      generationParameters?.maxTokens,
      generationParameters?.topP,
      generationParameters?.frequencyPenalty,
      systemMessage,
      generationParameters?.stop_str,
      image
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

  const sendCompletionToLLM = async (element, targetElement) => {
    const text = element.value;

    setIsThinking(true);

    var inferenceParams = '';

    if (experimentInfo?.config?.inferenceParams) {
      inferenceParams = experimentInfo?.config?.inferenceParams;
      inferenceParams = JSON.parse(inferenceParams);
    }

    const generationParamsJSON = experimentInfo?.config?.generationParams;
    const generationParameters = JSON.parse(generationParamsJSON);

    try {
      generationParameters.stop_str = JSON.parse(
        generationParameters?.stop_str
      );
    } catch (e) {
      console.log('Error parsing stop strings as JSON');
    }

    const result = await chatAPI.sendCompletion(
      currentModel,
      adaptor,
      text,
      generationParameters?.temperature,
      generationParameters?.maxTokens,
      generationParameters?.topP,
      false,
      generationParameters?.stop_str,
      targetElement
    );
    setIsThinking(false);

    // if (result?.text) element.value += result.text;
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

  const shortModelName = currentModel.split('/')[1];

  return (
    <>
      <Sheet
        id="interact-page"
        sx={{
          display: 'flex',
          height: '100%',
          paddingBottom: 1,
          flexDirection: 'row',
          gap: 2,
        }}
      >
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
              {shortModelName} {adaptor && '- '}
              {adaptor}
            </Typography>
            <FormControl>
              <FormLabel sx={{ fontWeight: '600' }}>Mode:</FormLabel>
              <Select
                name="mode"
                value={mode}
                onChange={(
                  event: React.SyntheticEvent | null,
                  newValue: string | null
                ) => setMode(newValue)}
              >
                <Option value="chat">Chat</Option>
                <Option value="completion">Completion</Option>
                <Option value="template">Template</Option>
                <Option value="embeddings">Embeddings</Option>
                <Option value="tokenize">Tokenize</Option>
              </Select>
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
          <PreviousMessageList
            conversations={conversations}
            conversationsIsLoading={conversationsIsLoading}
            conversationsMutate={conversationsMutate}
            setChats={setChats}
            setConversationId={setConversationId}
            conversationId={conversationId}
            experimentInfo={experimentInfo}
          />
        </Box>
        <Box sx={{ borderRight: '0.5px solid #ccc' }}></Box>
        {/* The following Sheet covers up the page if no model is running */}
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
            stopStreaming={stopStreaming}
            experimentInfoMutate={experimentInfoMutate}
            tokenCount={tokenCount}
            text={textToDebounce}
            debouncedText={debouncedText}
            defaultPromptConfigForModel={defaultPromptConfigForModel}
            currentModelArchitecture={currentModelArchitecture}
          />
        )}
        {mode === 'completion' && (
          <CompletionsPage
            text={text}
            setText={setText}
            debouncedText={debouncedText}
            tokenCount={tokenCount}
            isThinking={isThinking}
            sendCompletionToLLM={sendCompletionToLLM}
            stopStreaming={stopStreaming}
          />
        )}
        {mode === 'retrieval' && (
          <Rag experimentInfo={experimentInfo} setRagEngine={setRagEngine} />
        )}
        {mode === 'template' && (
          <TemplatedCompletion experimentInfo={experimentInfo} />
        )}
        {mode === 'embeddings' && (
          <Embeddings experimentInfo={experimentInfo}></Embeddings>
        )}
        {mode === 'tokenize' && (
          <Tokenize experimentInfo={experimentInfo}></Tokenize>
        )}
      </Sheet>
    </>
  );
}
