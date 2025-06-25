import { API_URL, INFERENCE_SERVER_URL, FULL_PATH } from './urls';
import { getMcpServerFile } from 'renderer/components/Experiment/Interact/interactUtils';
import * as chatAPI from './endpoints';

export async function sendAndReceive(
  currentModel: String,
  texts: any,
  temperature: number,
  maxTokens: number,
  topP: number,
  systemMessage: string,
  minP?: number,
) {
  const shortModelName = currentModel.split('/').slice(-1)[0];

  let messages = [];
  messages.push({ role: 'system', content: systemMessage });
  messages = messages.concat(texts);

  const data = {
    model: shortModelName,
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    system_message: systemMessage,
    ...(minP !== undefined ? { min_p: minP } : {}),
  };

  let result;

  try {
    const response = await fetch(
      `${INFERENCE_SERVER_URL()}v1/chat/completions`,
      {
        method: 'POST', // or 'PUT'
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(data),
      },
    );
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  if (result?.choices) {
    return { id: result.id, text: result.choices[0].message.content };
  }
  return null;
}

// Global variable that if enabled, will stop the current streaming response
let stopStreaming = false;

export function stopStreamingResponse() {
  stopStreaming = true;
}

export async function sendAndReceiveStreaming(
  currentModel: string,
  currentAdaptor: string,
  texts: any,
  temperature: number,
  maxTokens: number,
  topP: number,
  freqencyPenalty: number,
  systemMessage: string,
  stopString = null,
  image?: string,
  minP?: number,
) {
  let shortModelName = currentModel.split('/').slice(-1)[0];

  // if (currentAdaptor && currentAdaptor !== '') {
  //   shortModelName = currentAdaptor;
  // }

  let messages = [];
  messages.push({ role: 'system', content: systemMessage });
  messages = messages.concat(texts);
  const data: any = {
    model: shortModelName,
    adaptor: currentAdaptor,
    stream: true, // For streaming responses
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    frequency_penalty: freqencyPenalty,
    system_message: systemMessage,
    ...(minP !== undefined ? { min_p: minP } : {}),
  };

  // console.log('data', data);

  if (stopString) {
    data.stop = stopString;
  }

  let result;
  var id = Math.random() * 1000;

  const resultText = document.getElementById('resultText');
  if (resultText) resultText.innerText = '';

  let response;
  try {
    response = await fetch(`${INFERENCE_SERVER_URL()}v1/chat/completions`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.log('Exception accessing completions API:', error);
    alert('Network connection error');
    return null;
  }

  // if invalid response then return now
  if (!response.ok) {
    const response_json = await response.json();
    console.log('Completions API response:', response_json);
    const error_text = `Completions API Error
      HTTP Error Code: ${response?.status}
      ${response_json?.message}`;
    console.log(error_text);
    alert(error_text);
    return null;
  }

  // Read the response as a stream of data
  const reader = response?.body?.getReader();
  const decoder = new TextDecoder('utf-8');

  let finalResult = '';

  var start = performance.now();
  var firstTokenTime = null;
  var end = start;
  stopStreaming = false;

  // Reader loop
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();

      if (stopStreaming) {
        console.log('User requested to stop streaming');
        stopStreaming = false;
        reader?.cancel();
      }

      if (firstTokenTime == null) firstTokenTime = performance.now();

      if (done) {
        break;
      }
      // Massage and parse the chunk of data
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      let parsedLines = [];
      //console.log(lines);
      try {
        parsedLines = lines
          .map((line) => line.replace(/^data: /, '').trim()) // Remove the "data: " prefix
          .filter((line) => line !== '' && line !== '[DONE]') // Remove empty lines and "[DONE]"
          .map((line) => JSON.parse(line)); // Parse the JSON string
      } catch (error) {
        console.log('error parsing line', error);
      }
      // console.log(parsedLines);

      // eslint-disable-next-line no-restricted-syntax
      for (const parsedLine of parsedLines) {
        const { choices } = parsedLine;
        const { delta } = choices[0];
        const { content } = delta;

        id = parsedLine.id;
        // Update the UI with the new content
        if (content) {
          finalResult += content;
          if (resultText) {
            document.getElementById('resultText').innerText = finalResult;
            setTimeout(
              () => document.getElementById('endofchat')?.scrollIntoView(),
              100,
            );
          }
        }
      }
    }

    result = finalResult;
  } catch (error) {
    console.log('There was an error:', error);
  }

  // Stop clock:
  end = performance.now();
  var time = end - firstTokenTime;
  var timeToFirstToken = firstTokenTime - start;

  if (result) {
    if (resultText) resultText.innerText = '';
    return {
      id: id,
      text: result,
      time: time,
      timeToFirstToken: timeToFirstToken,
    };
  }
  return null;
}

export async function sendCompletion(
  currentModel: string,
  adaptor: string,
  text: string,
  temperature: number = 0.7,
  maxTokens: number = 256,
  topP: number = 1.0,
  useLongModelName = true,
  stopString = null,
  targetElementForStreaming,
  logprobs = false,
  minP?: number = 0.0,
) {
  console.log('sent completion request');
  let model = '';

  if (useLongModelName) {
    model = currentModel;
  } else {
    model = currentModel.split('/').slice(-1)[0];
  }

  // if (adaptor && adaptor !== '') {
  //   model = adaptor;
  // }

  //console.log('model', model);

  const data = {
    model: model,
    adaptor: adaptor,
    stream: true, // For streaming responses
    prompt: text,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    logprobs: logprobs,
    ...(minP !== undefined ? { min_p: minP } : {}), // add min_p if provided
  };

  if (stopString) {
    data.stop = stopString;
  }

  let result;
  var id = Math.random() * 1000;

  const resultText = targetElementForStreaming;
  const originalText = resultText.value;

  let response;

  try {
    response = await fetch(`${INFERENCE_SERVER_URL()}v1/completions`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.log('There was an error', error);
    return null;
  }

  if (!response.ok) {
    const response_json = await response.json();
    console.log('Completions API response:', response_json);
    const error_text = `Completions API Error
      HTTP Error Code: ${response?.status}
      ${response_json?.message}`;
    alert(error_text);
    return null;
  }

  // Read the response as a stream of data
  const reader = response?.body?.getReader();
  const decoder = new TextDecoder('utf-8');

  let finalResult = '';

  var start = performance.now();
  var firstTokenTime = null;
  var end = start;

  stopStreaming = false;

  // Reader loop
  try {
    while (true) {
      if (stopStreaming) {
        console.log('User requested to stop streaming');
        stopStreaming = false;
        reader?.cancel();
      }
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();

      if (firstTokenTime == null) firstTokenTime = performance.now();

      if (done) {
        break;
      }
      // Massage and parse the chunk of data
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      let parsedLines = [];
      try {
        parsedLines = lines
          .map((line) => line.replace(/^data: /, '').trim()) // Remove the "data: " prefix
          .filter((line) => line !== '' && line !== '[DONE]') // Remove empty lines and "[DONE]"
          .map((line) => JSON.parse(line)); // Parse the JSON string
      } catch (error) {
        console.log('error parsing line', error);
      }

      // eslint-disable-next-line no-restricted-syntax
      for (const parsedLine of parsedLines) {
        //console.log('parsedLine', parsedLine);
        const { choices } = parsedLine;
        const { text } = choices[0];

        console.log('choice:');
        console.log(choices[0]);

        id = parsedLine?.id;
        // Update the UI with the new content
        if (text) {
          finalResult += text;
          if (resultText) {
            document.getElementById('completion-textarea').value =
              originalText + finalResult;
            // document.getElementById('completion-textarea').value = finalResult;
            setTimeout(
              () => document.getElementById('endofchat')?.scrollIntoView(),
              100,
            );
          }
        }
      }
    }

    result = finalResult;
  } catch (error) {
    console.log('There was an error:', error);
  }

  // Stop clock:
  end = performance.now();
  var time = end - firstTokenTime;
  var timeToFirstToken = firstTokenTime - start;

  if (result) {
    // if (resultText) resultText.innerText = '';
    return {
      id: id,
      text: result,
      time: time,
      timeToFirstToken: timeToFirstToken,
    };
  }
  return null;
}

// This does a completion but instead of updating an element, it calls an update function
export async function sendCompletionReactWay(
  currentModel: string,
  adaptor: string,
  text: string,
  temperature: number = 0.7,
  maxTokens: number = 256,
  topP: number = 1.0,
  useLongModelName = true,
  stopString = null,
  updateFunction,
  logprobs = false,
) {
  console.log('sent completion request');
  let model = '';

  if (useLongModelName) {
    model = currentModel;
  } else {
    model = currentModel.split('/').slice(-1)[0];
  }

  // if (adaptor && adaptor !== '') {
  //   model = adaptor;
  // }

  const stream = true;

  //console.log('model', model);

  const data = {
    model: model,
    adaptor: adaptor,
    stream: stream, // For streaming responses
    prompt: text,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    logprobs: logprobs,
  };

  if (stopString) {
    data.stop = stopString;
  }

  let result;
  var id = Math.random() * 1000;

  let response;

  try {
    response = await fetch(`${INFERENCE_SERVER_URL()}v1/completions`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.log('There was an error', error);
    return null;
  }

  if (!response.ok) {
    const response_json = await response.json();
    console.log('Completions API response:', response_json);
    const error_text = `Completions API Error
      HTTP Error Code: ${response?.status}
      ${response_json?.message}`;
    alert(error_text);
    return null;
  }

  if (!stream) {
    result = await response.json();
    return result;
  }

  // Read the response as a stream of data
  const reader = response?.body?.getReader();
  const decoder = new TextDecoder('utf-8');

  let finalResult = '';
  let finalResultArray = [];

  var start = performance.now();
  var firstTokenTime = null;
  var end = start;

  stopStreaming = false;

  // Reader loop
  try {
    while (true) {
      if (stopStreaming) {
        console.log('User requested to stop streaming');
        stopStreaming = false;
        reader?.cancel();
      }
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();

      if (firstTokenTime == null) firstTokenTime = performance.now();

      if (done) {
        break;
      }
      // Massage and parse the chunk of data
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      let parsedLines = [];
      try {
        parsedLines = lines
          .map((line) => line.replace(/^data: /, '').trim()) // Remove the "data: " prefix
          .filter((line) => line !== '' && line !== '[DONE]') // Remove empty lines and "[DONE]"
          .map((line) => JSON.parse(line)); // Parse the JSON string
      } catch (error) {
        console.log('error parsing line', error);
      }

      // eslint-disable-next-line no-restricted-syntax
      for (const parsedLine of parsedLines) {
        //console.log('parsedLine', parsedLine);
        const { choices } = parsedLine;
        const { text } = choices[0];

        console.log('choice:');
        console.log(choices[0]);

        id = parsedLine?.id;
        // Update the UI with the new content
        if (text) {
          if (logprobs) {
            finalResultArray.push(choices[0]);
            updateFunction(finalResultArray);
          } else {
            finalResult += text;
            updateFunction(finalResult);
          }
          // document.getElementById('completion-textarea').value = finalResult;
          setTimeout(
            () => document.getElementById('endofchat')?.scrollIntoView(),
            100,
          );
        }
      }
    }

    result = finalResult;
  } catch (error) {
    console.log('There was an error:', error);
  }

  // Stop clock:
  end = performance.now();
  var time = end - firstTokenTime;
  var timeToFirstToken = firstTokenTime - start;

  if (result) {
    // if (resultText) resultText.innerText = '';
    return {
      id: id,
      text: result,
      time: time,
      timeToFirstToken: timeToFirstToken,
    };
  }
  return null;
}

// This sends a request to the completion endpoint
// but sends an array of prompts instead of a single prompt. Temporarily: Sends multiple completion requests separately.
export async function sendBatchedCompletion(
  currentModel: string,
  adaptor: string,
  text: string[],
  temperature: number = 0.7,
  maxTokens: number = 256,
  topP: number = 1.0,
  useLongModelName = true,
  stopString = null,
  repeatTimes = 1,
  minP?: number = 0.0,
) {
  let model = '';
  if (useLongModelName) {
    model = currentModel;
  } else {
    model = currentModel.split('/').slice(-1)[0];
  }

  // Helper function to sleep between requests
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Array to store all individual results
  const allResults = [];

  // Process each prompt one at a time
  for (const prompt of text) {
    const data = {
      model: model,
      adaptor: adaptor,
      stream: false,
      prompt: prompt, // Send single prompt instead of array
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      n: repeatTimes,
      ...(minP !== undefined ? { min_p: minP } : {}),
    };

    if (stopString) {
      data.stop = stopString;
    }

    let response;
    try {
      response = await fetch(`${INFERENCE_SERVER_URL()}v1/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      allResults.push(result);

      // Sleep for 0.01 seconds (10ms) between requests
      await sleep(10);
    } catch (error) {
      console.log('There was an error processing prompt:', prompt, error);
      allResults.push({ error: 'Request failed', prompt });
    }
  }

  // Create consolidated response with choices from all results
  const consolidatedResponse = {
    choices: [],
    created: Math.floor(Date.now() / 1000),
    id: `cmpl-${Math.random().toString(36).substring(2, 10)}`,
    model: model,
    object: 'text_completion',
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };

  // Extract choices from individual results
  allResults.forEach((result, resultIndex) => {
    if (result.choices) {
      result.choices.forEach((choice, choiceIndex) => {
        consolidatedResponse.choices.push({
          index: consolidatedResponse.choices.length,
          text: choice.text || '',
          logprobs: choice.logprobs || null,
          finish_reason: choice.finish_reason || 'stop',
        });
      });

      // Accumulate token usage if available
      if (result.usage) {
        consolidatedResponse.usage.prompt_tokens +=
          result.usage.prompt_tokens || 0;
        consolidatedResponse.usage.completion_tokens +=
          result.usage.completion_tokens || 0;
        consolidatedResponse.usage.total_tokens +=
          result.usage.total_tokens || 0;
      }
    }
  });

  return consolidatedResponse;
}

// If we want to use the chat endpoint of the inference engine,
// we can't automatically batch. You can not send an array of chats
// So we send the requests in a loop
export async function sendBatchedChat(
  currentModel: string,
  adaptor: string,
  text: string[][],
  temperature: number = 0.7,
  maxTokens: number = 256,
  topP: number = 1.0,
  useLongModelName = true,
  stopString = null,
  minP?: number = 0.0,
) {
  let model = '';
  if (useLongModelName) {
    model = currentModel;
  } else {
    model = currentModel.split('/').slice(-1)[0];
  }

  // if (adaptor && adaptor !== '') {
  //   model = adaptor;
  // }

  const data = {
    model: model,
    adaptor: adaptor,
    stream: false,
    messages: text,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    inference_url: `${INFERENCE_SERVER_URL()}v1/chat/completions`,
    ...(minP !== undefined ? { min_p: minP } : {}),
  };

  if (stopString) {
    data.stop = stopString;
  }

  let result;
  let results = [];

  // // for each array element in text, send a request
  // for (let i = 0; i < text.length; i++) {
  //   const message = text[i];
  //   data.messages = message;
  //   let response;
  //   try {
  //     response = await fetch(`${INFERENCE_SERVER_URL()}v1/chat/completions`, {
  //       method: 'POST', // or 'PUT'
  //       headers: {
  //         'Content-Type': 'application/json',
  //         accept: 'application/json',
  //       },
  //       body: JSON.stringify(data),
  //     });
  //     if (!response.ok) {
  //       throw new Error(`Server responded with status ${response.status}`);
  //     }
  //   } catch (error) {
  //     console.log('There was an error', error);
  //     return null;
  //   }

  //   result = await response.json();
  //   results.push(result);

  // }
  // console.log("RESULTS", results);
  let response;
  const batchedChatUrl = `${API_URL()}batch/chat/completions`;
  try {
    response = await fetch(batchedChatUrl, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
  } catch (error) {
    console.log('There was an error', error);
    return null;
  }

  results = await response.json();

  return results;
}

export async function callTool(
  function_name: String,
  function_args: Object = {},
) {
  const arg_string = JSON.stringify(function_args);
  const { mcp_server_file, mcp_args, mcp_env } = await getMcpServerFile();
  let url = chatAPI.Endpoints.Tools.Call(function_name, arg_string);

  // Add query parameters if present
  const params = [];
  if (mcp_server_file)
    params.push(`mcp_server_file=${encodeURIComponent(mcp_server_file)}`);
  if (mcp_args) params.push(`mcp_args=${encodeURIComponent(mcp_args)}`);
  if (mcp_env) params.push(`mcp_env=${encodeURIComponent(mcp_env)}`);
  if (params.length > 0) {
    url += (url.includes('?') ? '&' : '?') + params.join('&');
  }

  const response = await fetch(url);
  const result = await response.json();
  return result;
}

export async function getAvailableModels() {
  const response = await fetch(API_URL() + 'model/gallery');
  const result = await response.json();
  return result;
}

/**
 * Pass an array of strings, and this will
 * return an array of embeddings
 */
export async function getEmbeddings(model: string, text: string[]) {
  let shortModelName = model.split('/').slice(-1)[0];

  let result;

  const data = {
    model: shortModelName,
    input: text,
  };

  try {
    const response = await fetch(`${API_URL()}v1/embeddings`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  return result;
}

export async function tokenize(model: string, text: string) {
  let shortModelName = model.split('/').slice(-1)[0];

  let result;

  const data = {
    model: shortModelName,
    text: text,
  };

  try {
    const response = await fetch(`${API_URL()}tokenize`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  return result;
}

export async function generateLogProbs(model: string, prompt: string) {
  let shortModelName = model.split('/').slice(-1)[0];
  // @TODO Doesn't work with an adaptor right now

  // Hardcode these for now
  const temperature = 0.7;
  const maxTokens = 256;
  const topP = 0.95;
  const stopString = null;

  const data = {
    model: shortModelName,
    stream: false,
    prompt: prompt,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    logprobs: 1,
  };

  if (stopString) {
    data.stop = stopString;
  }

  const response = await fetch(`${INFERENCE_SERVER_URL()}v1/completions`, {
    method: 'POST', // or 'PUT'
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  return result;
}

/**
 * Count tokens in a provided messages array
 */
export async function countTokens(model: string, text: string[]) {
  if (!model) return 0;

  let shortModelName = model.split('/').slice(-1)[0];

  let result;

  const prompts = [
    {
      model: shortModelName,
      prompt: text[0],
      max_tokens: 0,
    },
  ];

  const data = {
    prompts: prompts,
  };

  try {
    const response = await fetch(`${API_URL()}api/v1/token_check`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  return result?.prompts?.[0];
}

/**
 * Count tokens in a provided messages array
 */
export async function countChatTokens(model: string, text: any) {
  if (!model) return 0;

  let shortModelName = model.split('/').slice(-1)[0];

  let messages = [];
  messages = messages.concat(text);

  const data = {
    model: shortModelName,
    messages,
  };

  let result;

  try {
    const response = await fetch(`${API_URL()}v1/chat/count_tokens`, {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(data),
    });
    result = await response.json();
  } catch (error) {
    console.log('There was an error', error);
  }

  return result;
}
