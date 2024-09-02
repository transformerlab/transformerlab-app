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

function scrollChatToBottom() {
  // We animate it twice, the second time to accomodate the scale up transition
  // I find this looks better than one later scroll
  setTimeout(() => document.getElementById('endofchat')?.scrollIntoView(), 100);
  setTimeout(() => document.getElementById('endofchat')?.scrollIntoView(), 400);
}

// TODO: Make this call the backend to get the list of tools that are available
// For now this is a static message
function getAgentSystemMessage() {
  return `You are a function calling AI model. You are provided with function signatures within <tools></tools> XML tags. You may call one or more functions to assist with the user query. Don't make assumptions about what values to plug into functions. Here are the available tools: <tools> {"type": "function", "function": {"name": "get_current_temperature", "description": "get_current_temperature(location: str) - Gets the temperature at a given location.

    Args:
        location(str): The location to get the temperature for, in the format "city, country"", "parameters": {"type": "object", "properties": {"location": {"type": "string", "description": "The location to get the temperature for, in the format \"city, country\""}}, "required": ["location"]}}
{"type": "function", "function": {"name": "get_current_wind_speed", "description": "get_current_wind_speed(location: str) -> float - Get the current wind speed in km/h at a given location.

    Args:
        location(str): The location to get the temperature for, in the format "City, Country"
    Returns:
        The current wind speed at the given location in km/h, as a float.", "parameters": {"type": "object", "properties": {"location": {"type": "string", "description": "The location to get the temperature for, in the format \"City, Country\""}}, "required": ["location"]}} </tools>Use the following pydantic model json schema for each tool call you will make: {"properties": {"name": {"title": "Name", "type": "string"}, "arguments": {"title": "Arguments", "type": "object"}}, "required": ["name", "arguments"], "title": "FunctionCall", "type": "object"}}
For each function call return a json object with function name and arguments within <tool_call></tool_call> XML tags as follows:
<tool_call>
{"name": <function-name>, "arguments": <args-dict>}
</tool_call>`
}

// Try to interpret a model's request to call a tool and call the backend
// If successful respond with the API's answer
// If there is an issue, respond with a message that the model will understand
function callTool(requestString: str) {
  // TEMP: Return a random number for now
  return String(requestString.length % 30);
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
  if (mode === 'chat' || mode == 'agent') {
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

  /////////////////////////////////////////////
  //FUNCTIONS USED BY BOTH CHAT AND AGENT PANES
  /////////////////////////////////////////////

  // Call this function to add a new chat to the chats array and scroll the UI.
  // Since setChats won't update chats until after this render
  // this also returns an updated array you can work with before next render
  function addChat(newChat: object) {
    const newChats = [...chats, newChat];

    // Add Message to Chat Array:
    setChats(newChats);
    scrollChatToBottom();

    return newChats;
  }

  function addUserChat(text: String, image?: string) {
    // Generate a random key for this message
    const r = Math.floor(Math.random() * 1000000);

    return addChat({
      t: text,
      user: 'human',
      key: r,
      image: image
    });
  }

  function addToolResult(result: object) {
    const r = Math.floor(Math.random() * 1000000);
    return {
      t: result,
      user: 'tool',
      key: r
    }
  }

  async function addAssistantChat(result: object) {
    let numberOfTokens = await chatAPI.countTokens(currentModel, [
      result?.text,
    ]);
    numberOfTokens = numberOfTokens?.tokenCount;
    console.log('Number of Tokens: ', numberOfTokens);
    console.log(result);
    const timeToFirstToken = result?.timeToFirstToken;
    const tokensPerSecond = (numberOfTokens / parseFloat(result?.time)) * 1000;

    return {
      t: result?.text,
      user: 'bot',
      key: result?.id,
      numberOfTokens: numberOfTokens,
      timeToFirstToken: timeToFirstToken,
      tokensPerSecond: tokensPerSecond,
    }
  }

  // This returns the Chats list in the format that the LLM is expecting
  function getChatsInLLMFormat() {
    return chats.map((c) => {
      return {
        role: c.user === 'bot' ? 'assistant' : 'user',
        content: c.t ? c.t : '',
      };
    });
  }

  const sendNewMessageToLLM = async (text: String, image?: string) => {

    // Add new user message to chat history
    var newChats = addUserChat(text, image);

    const timeoutId = setTimeout(() => {
      setIsThinking(true);
      scrollChatToBottom();
    }, 100);

    const systemMessage =
      document.getElementsByName('system-message')[0]?.value;

    // Get a list of all the existing chats so we can send them to the LLM
    let texts = getChatsInLLMFormat();

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

    newChats = [...newChats, {
      t: result?.text,
      user: 'bot',
      key: result?.id,
      numberOfTokens: numberOfTokens,
      timeToFirstToken: timeToFirstToken,
      tokensPerSecond: tokensPerSecond,
    }];

    setChats(newChats);

    // If this is a new conversation, generate a new conversation Id
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

  const sendNewMessageToAgent = async (text: String, image?: string) => {

    // Add new user message to chat history
    var newChats = addUserChat(text, image);

    const timeoutId = setTimeout(() => {
      setIsThinking(true);
      scrollChatToBottom();
    }, 100);

    const systemMessage = getAgentSystemMessage();

    // Get a list of all the existing chats so we can send them to the LLM
    let texts = getChatsInLLMFormat();

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
    console.log(texts);

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
    let result = await chatAPI.sendAndReceiveStreaming(
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

    // BIG QUESTION: Doing all of this back and forth in a single operation. Is that right?
    // Before we return to the user, check to see if the LLM is trying to call a function
    const llm_response = result?.text;
    if (llm_response && llm_response.includes("<tool_call>")) {
      console.log(`Model responded with request for tool.`);
      texts.push({ role: 'assistant', content: llm_response });

      newChats = [...newChats, await addAssistantChat(result)];
      setChats(newChats);

      const func_name = "temp_placeholder"
      const func_response = callTool(llm_response);
      console.log(`Calling Function ${func_name}:`);
      console.log(func_response);

      // Add function output as response to conversation
      const tool_response = func_response;

      // TODO: this should be tool not user...but have to add that
      texts.push({ role: 'user', content: tool_response });

      newChats = [...newChats, addToolResult(tool_response)];
      setChats(newChats);

      // Call the model AGAIN with the tool response
      // Update result with the new response
      result = await chatAPI.sendAndReceiveStreaming(
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
    }

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

    newChats = [...newChats, {
      t: result?.text,
      user: 'bot',
      key: result?.id,
      numberOfTokens: numberOfTokens,
      timeToFirstToken: timeToFirstToken,
      tokensPerSecond: tokensPerSecond,
    }];

    setChats(newChats);

    // If this is a new conversation, generate a new conversation Id
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

  return (
    <>
      <Sheet
        id="interact-page"
        sx={{
          display: 'flex',
          height: '100%',
          paddingBottom: 1,
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
        {mode === 'agent' && (
          <ChatPage
            key={conversationId}
            chats={chats}
            setChats={setChats}
            experimentInfo={experimentInfo}
            isThinking={isThinking}
            sendNewMessageToLLM={sendNewMessageToAgent}
            stopStreaming={stopStreaming}
            experimentInfoMutate={experimentInfoMutate}
            tokenCount={tokenCount}
            text={textToDebounce}
            debouncedText={debouncedText}
            defaultPromptConfigForModel={defaultPromptConfigForModel}
            agentMode
            currentModelArchitecture={currentModelArchitecture}
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
              {currentModel} {adaptor && '- '}
              {adaptor}
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
                size="sm"
                sx={{
                  minHeight: 48,
                  padding: '4px',
                  borderRadius: '12px',
                  bgcolor: 'neutral.softBg',
                  '--RadioGroup-gap': '4px',
                  '--Radio-actionRadius': '8px',
                  justifyContent: 'space-evenly',
                  '& .MuiRadio-root': {
                    padding: '0px',
                  },
                }}
              >
                {['chat', 'completion', 'template', 'agent' /*'retrieval', 'more'*/].map(
                  (item) => (
                    <Radio
                      key={item}
                      color="neutral"
                      value={item}
                      disableIcon
                      disabled={isThinking}
                      label={
                        item == 'more' ? (
                          <FaEllipsisVertical
                            size="12px"
                            style={{ marginBottom: '-1px' }}
                          />
                        ) : (
                          item
                        )
                      }
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
                  )
                )}
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
      </Sheet>
    </>
  );
}
