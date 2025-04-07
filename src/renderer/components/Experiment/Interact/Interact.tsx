/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';
import useSWR from 'swr';

import {
  Sheet,
  FormControl,
  Button,
  Typography,
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
import Rag from '../Rag';
import TemplatedCompletion from './TemplatedCompletion';
import Tokenize from './Tokenize';
import Embeddings from '../Embeddings';
import { ChevronDownIcon } from 'lucide-react';

import {
  scrollChatToBottom,
  focusChatInput,
  getAgentSystemMessage,
} from './interactUtils';
import Batched from './Batched/Batched';
import VisualizeLogProbs from './VisualizeLogProbs';
import VisualizeGeneration from './VisualizeGeneration';
import ModelLayerVisualization from './ModelLayerVisualization';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Chat({
  experimentInfo,
  experimentInfoMutate,
  setRagEngine,
  mode,
  setMode,
}) {
  const { models } = chatAPI.useModelStatus();
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

  const [text, setText] = React.useState('');

  const { data: defaultPromptConfigForModel } = useSWR(
    chatAPI.TEMPLATE_FOR_MODEL_URL(experimentInfo?.config?.foundation),
    fetcher,
  );

  const parsedPromptData = experimentInfo?.config?.prompt_template;

  console.log('rendering chat');
  // focusChatInput();
  scrollChatToBottom();

  var textToDebounce = '';

  // The following code, when in chat mode, will try to create a fake string
  // that roughly represents the chat as a long prompt. But this is a hack:
  // If we really want count tokens accurately, we need to pass the system
  // message and messages to the server and let it format the prompt as per
  // the moel's template. More info here: https://huggingface.co/docs/transformers/main/en/chat_templating
  // For now this is helpful a rough indicator of the number of tokens used.
  // But we should improve this later
  if (mode === 'chat' || mode === 'tools') {
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
      if (mode === 'chat' || mode === 'tools') {
        countChatTokens();
      } else {
        countTokens();
      }
    }
    scrollChatToBottom();
  }, []);

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
      focusChatInput();
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
          JSON.stringify(generationParameters),
        ),
      ).then(() => {
        experimentInfoMutate();
      });
    }
  }, [generationParameters]);

  function stopStreaming() {
    chatAPI.stopStreamingResponse();
  }

  //////////////////////////////////////////////////
  // FUNCTIONS USED BY BOTH CHAT AND TOOL USE PANES
  //////////////////////////////////////////////////

  // Call this function to add a new chat to the chats array and scroll the UI.
  // Since setChats won't update chats until after this render
  // this also returns an updated array you can work with before next render
  function addChat(newChat: object) {
    const newChats = [...chats, newChat];

    // Add Message to Chat Array:
    setChats((prevChat) => [...prevChat, newChat]);

    return newChats;
  }

  function addUserChat(text: String, image?: string) {
    // Generate a random key for this message
    const r = Math.floor(Math.random() * 1000000);

    return addChat({
      t: text,
      user: 'human',
      key: r,
      image: image,
    });
  }

  function addToolResult(text: String) {
    const r = Math.floor(Math.random() * 1000000);
    return {
      t: text,
      user: 'tool',
      key: r,
    };
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
    };
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
        generationParameters?.stop_str,
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
      image,
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

    newChats = [
      ...newChats,
      {
        t: result?.text,
        user: 'bot',
        key: result?.id,
        numberOfTokens: numberOfTokens,
        timeToFirstToken: timeToFirstToken,
        tokensPerSecond: tokensPerSecond,
      },
    ];

    setChats((prevChat) => [
      ...prevChat,
      {
        t: result?.text,
        user: 'bot',
        key: result?.id,
        numberOfTokens: numberOfTokens,
        timeToFirstToken: timeToFirstToken,
        tokensPerSecond: tokensPerSecond,
      },
    ]);

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
    focusChatInput();
    return result?.text;
  };

  /**
   * getToolCallsFromLLMResponse
   *
   * Returns an array of tool call JSON objects.
   * If any tool calls are not formatted correctly then an error
   * prints to the console and they are skipped..
   * TODO: Generate and handle error if any tool call
   * is not formatted correctly
   */
  function getToolCallsFromLLMResponse(llm_response: String) {
    let tool_calls: any[] = [];

    if (!llm_response) return tool_calls;

    let start = 0;
    let end = -1;
    const START_TAG = '<tool_call>';
    const END_TAG = '</tool_call>';

    while (start >= 0) {
      // first search for start tag
      start = llm_response.indexOf(START_TAG, start);
      if (start == -1) break; // no start tags found

      // Move the start marker after the tag and search for close tag
      start += START_TAG.length;
      end = llm_response.indexOf(END_TAG, start);
      const tool_string =
        end == -1
          ? llm_response.substring(start)
          : llm_response.substring(start, end);

      // Decode the JSON string and add it to result if valid
      try {
        const tool_call = JSON.parse(tool_string);
        tool_calls.push(tool_call);
      } catch (e) {
        console.error(e);
      }

      if (end == -1) break; // no more text to search
      start = end + END_TAG.length; // continue search after end tag
    }
    return tool_calls;
  }

  const sendNewMessageToAgent = async (text: String, image?: string) => {
    // Add new user message to chat history
    var newChats = addUserChat(text, image);

    const timeoutId = setTimeout(() => {
      setIsThinking(true);
    }, 100);

    const systemMessage = await getAgentSystemMessage();

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
        generationParameters?.stop_str,
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
      image,
    );

    // The model may make repeated tool calls but don't let it get stuck in a loop
    const MAX_TOOLS_CALLS = 3;
    for (
      let tools_calls_remaining = MAX_TOOLS_CALLS;
      tools_calls_remaining > 0;
      tools_calls_remaining--
    ) {
      // Before we return to the user, check to see if the LLM is trying to call a function
      // Tool calls should be contained between a <tool_call> tag
      // and either a close tag or the end of the string
      const llm_response = result?.text;

      if (llm_response && llm_response.includes('<tool_call>')) {
        const tool_calls = getToolCallsFromLLMResponse(llm_response);

        // if there are any tool calls in the LLM response then
        // we have to call the Tools API and send back responses to the LLM
        if (Array.isArray(tool_calls) && tool_calls.length) {
          // first push the assistant's original response on to the chat lists
          texts.push({ role: 'assistant', content: llm_response });
          const tool_call_chat = await addAssistantChat(result);
          newChats = [...newChats, tool_call_chat];
          setChats((prevChat) => [...prevChat, tool_call_chat]);

          // iterate through tool_calls (there can be more than one)
          // and actually call the tools and save responses
          let tool_responses = [];
          for (const tool_call of tool_calls) {
            const func_name = tool_call.name;
            const func_args = tool_call.arguments;
            const func_response = await chatAPI.callTool(func_name, func_args);

            // If this was successful then respond with the results
            if (
              func_response.status &&
              func_response.status != 'error' &&
              func_response.data
            ) {
              tool_responses.push(func_response.data);

              // Otherwise, report an error to the LLM!
            } else {
              if (func_response.message) {
                tool_responses.push(func_response.message);
              } else {
                tool_responses.push(
                  'There was an unknown error calling the tool.',
                );
              }
            }
          }

          // Add all function output as response to conversation
          // How to format response if there are multiple calls?
          // For now just put a newline between them.
          const tool_response = tool_responses.join('\n');

          // TODO: role should be 'tool' not 'user'
          // ...but tool is not supported by backend right now?
          texts.push({ role: 'user', content: tool_response });
          const tool_result = addToolResult(tool_response);
          newChats = [...newChats, tool_result];
          setChats((prevChat) => [...prevChat, tool_result]);

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
            image,
          );
        }
      }
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

    newChats = [
      ...newChats,
      {
        t: result?.text,
        user: 'bot',
        key: result?.id,
        numberOfTokens: numberOfTokens,
        timeToFirstToken: timeToFirstToken,
        tokensPerSecond: tokensPerSecond,
      },
    ];

    setChats((prevChat) => [
      ...prevChat,
      {
        t: result?.text,
        user: 'bot',
        key: result?.id,
        numberOfTokens: numberOfTokens,
        timeToFirstToken: timeToFirstToken,
        tokensPerSecond: tokensPerSecond,
      },
    ]);

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

    focusChatInput();
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
    fetcher,
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
        generationParameters?.stop_str,
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
      targetElement,
    );
    setIsThinking(false);

    console.log('result', result);
    return result?.text;
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
    <Sheet
      id="surrounding-container-for-the-whole-thing"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <Box
        id="top-bar-of-chat-page-that-says-name-and-dropdown"
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 2,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <FormControl>
          {/* <FormLabel>Interaction Mode:&nbsp; </FormLabel> */}
          <Select
            name="mode"
            value={mode}
            onChange={(
              event: React.SyntheticEvent | null,
              newValue: string | null,
            ) => setMode(newValue)}
            variant="soft"
            size="md"
            renderValue={(option: SelectOption<string> | null) => (
              <Typography level="title-lg">{option?.label}</Typography>
            )}
            indicator={<ChevronDownIcon />}
            sx={
              {
                // [`& .${selectClasses.indicator}`]: {
                //   transition: '0.2s',
                //   [`&.${selectClasses.expanded}`]: {
                //     transform: 'rotate(-180deg)',
                //   },
                // },
              }
            }
          >
            <Option value="chat">Chat</Option>
            <Option value="completion">Completion</Option>
            <Option value="visualize_model">Model Activations</Option>
            <Option value="model_layers">Model Architecture</Option>
            <Option value="rag">Query Docs (RAG)</Option>
            <Option value="tools">Tool Calling</Option>
            <Option value="template">Templated Prompt</Option>
            <Option value="embeddings">Embeddings</Option>
            <Option value="tokenize">Tokenize</Option>
            <Option value="logprobs">Visualize Logprobs</Option>
            <Option value="batched">Batched Query</Option>
          </Select>
        </FormControl>
        <Typography level="title-md">
          {shortModelName} {adaptor && '- '}
          {adaptor}
        </Typography>
      </Box>

      <Sheet
        sx={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          display: 'flex',
          paddingTop: 2,
        }}
      >
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
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
            conversations={conversations}
            conversationsIsLoading={conversationsIsLoading}
            conversationsMutate={conversationsMutate}
            setConversationId={setConversationId}
            conversationId={conversationId}
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
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
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
        )}
        {mode === 'visualize_model' && (
          <VisualizeGeneration
            tokenCount={tokenCount}
            stopStreaming={stopStreaming}
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
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
        )}
        {mode === 'model_layers' && (
          <ModelLayerVisualization
            tokenCount={tokenCount}
            stopStreaming={stopStreaming}
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
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
        )}
        {mode === 'tools' && (
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
            currentModelArchitecture={currentModelArchitecture}
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
            conversations={conversations}
            conversationsIsLoading={conversationsIsLoading}
            conversationsMutate={conversationsMutate}
            setConversationId={setConversationId}
            conversationId={conversationId}
            enableTools
          />
        )}
        {mode === 'template' && (
          <TemplatedCompletion
            experimentInfo={experimentInfo}
            tokenCount={tokenCount}
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
            defaultPromptConfigForModel={defaultPromptConfigForModel}
            conversations={conversations}
            conversationsIsLoading={conversationsIsLoading}
            conversationsMutate={conversationsMutate}
            setChats={setChats}
            setConversationId={setConversationId}
            conversationId={conversationId}
            experimentInfoMutate={experimentInfoMutate}
          />
        )}
        {mode === 'embeddings' && (
          <Embeddings experimentInfo={experimentInfo}></Embeddings>
        )}
        {mode === 'tokenize' && (
          <Tokenize experimentInfo={experimentInfo}></Tokenize>
        )}
        {mode === 'logprobs' && (
          <VisualizeLogProbs
            text={text}
            setText={setText}
            debouncedText={debouncedText}
            tokenCount={tokenCount}
            isThinking={isThinking}
            sendCompletionToLLM={sendCompletionToLLM}
            stopStreaming={stopStreaming}
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
            defaultPromptConfigForModel={defaultPromptConfigForModel}
            conversations={conversations}
            conversationsIsLoading={conversationsIsLoading}
            conversationsMutate={conversationsMutate}
            setChats={setChats}
            setConversationId={setConversationId}
            conversationId={conversationId}
            experimentInfo={experimentInfo}
            experimentInfoMutate={experimentInfoMutate}
          ></VisualizeLogProbs>
        )}
        {mode === 'rag' && (
          <Rag experimentInfo={experimentInfo} setRagEngine={setRagEngine} />
        )}
        {mode == 'batched' && (
          <Batched
            tokenCount={tokenCount}
            defaultPromptConfigForModel={defaultPromptConfigForModel}
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
            sendCompletionToLLM={sendCompletionToLLM}
            experimentInfo={experimentInfo}
          />
        )}
      </Sheet>
      <Sheet
        sx={{
          position: 'absolute',
          top: '0%',
          left: '0%',
          zIndex: 10000,
          backgroundColor: 'var(--joy-palette-neutral-softBg)',
          opacity: 0.9,
          borderRadius: 'md',
          padding: 2,
          height: !models?.[0]?.id ? '90dvh' : 'inherit',
          width: !models?.[0]?.id ? '100dvh' : 'inherit',
          visibility: !models?.[0]?.id ? 'visible' : 'hidden',
        }}
      >
        <Alert
          sx={{ position: 'relative', top: '50%', justifyContent: 'center' }}
        >
          No Model is Running
        </Alert>
      </Sheet>
    </Sheet>
  );
}
