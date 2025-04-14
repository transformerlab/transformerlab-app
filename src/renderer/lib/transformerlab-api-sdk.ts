/* eslint-disable camelcase */
/* eslint-disable prefer-template */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */

/** This SDK manages all connection to the transformerlab api
 *
 * There are several ways this SDK enables connections
 * 1) Functions like sendAndReceive talk directly to the API
 *    support complex communication back and forth with the
 *    API
 *
 * 2) Functions under ENDPOINTS are mappings to URLs on the
 *    API. The reason we have these is that we heavily use
 *    SWR in React and SWR works by using the specific
 *    endpoint URLs on the API as Keys for caching and
 *    managing state. So instead of abstracting the calling
 *    of APIs, this SDK sends back the URLs and let's SWR
 *    call them directly. We could improve this later by
 *    bringing the SWR Fetcher functions into this SDK
 *    and somehow generating our own keys
 *
 * 3) We have a few SWR functions that start with use___
 *    like useServerStats that are SWR events that use
 *    SWR to do more complicated things like polling
 *
 *
 * But the key to this whole file is that all talking to
 * the API is captured here, so that the rest of the app
 * does not need to know any API specifics
 * */

import { log } from 'console';
import useSWR from 'swr';

export function API_URL() {
  return window.TransformerLab?.API_URL || null;
}

export function INFERENCE_SERVER_URL() {
  return window.TransformerLab?.inferenceServerURL || API_URL();
}

export function FULL_PATH(path: string) {
  if (API_URL() === null) {
    return null;
  }
  return API_URL() + path;
}

export async function sendAndReceive(
  currentModel: String,
  texts: any,
  temperature: number,
  maxTokens: number,
  topP: number,
  systemMessage: string,
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

  if (result.choices) {
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
) {
  let shortModelName = currentModel.split('/').slice(-1)[0];

  // if (currentAdaptor && currentAdaptor !== '') {
  //   shortModelName = currentAdaptor;
  // }

  let messages = [];
  messages.push({ role: 'system', content: systemMessage });
  messages = messages.concat(texts);
  const data = {
    model: shortModelName,
    adaptor: currentAdaptor,
    stream: true, // For streaming responses
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    frequency_penalty: freqencyPenalty,
    system_message: systemMessage,
  };

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
  console.log(`Calling Function: ${function_name}`);
  console.log(`with arguments ${arg_string}`);

  const response = await fetch(Endpoints.Tools.Call(function_name, arg_string));
  const result = await response.json();
  console.log(result);
  return result;
}

export async function getAvailableModels() {
  const response = await fetch(API_URL() + 'model/gallery');
  const result = await response.json();
  return result;
}

export async function downloadModelFromHuggingFace(
  modelName: string,
  job_id = null,
) {
  console.log(encodeURIComponent(modelName));

  let requestString = `${API_URL()}model/download_from_huggingface?model=${encodeURIComponent(
    modelName,
  )}`;
  if (job_id) {
    requestString += `&job_id=${job_id}`;
  }

  let result = {};
  try {
    const response = await fetch(requestString);
    result = await response.json();

    // Error during fetch
  } catch (error) {
    return {
      status: 'error',
      message: 'Fetch exception: ' + error,
    };
  }

  return result;
}

export async function downloadModelFromGallery(
  galleryID: string,
  job_id = null,
) {
  console.log(encodeURIComponent(galleryID));

  let requestString = `${API_URL()}model/download_model_from_gallery?gallery_id=${encodeURIComponent(
    galleryID,
  )}`;
  if (job_id) {
    requestString += `&job_id=${job_id}`;
  }
  const response = await fetch(requestString);
  const result = await response.json();

  return result;
}

// Return the models that the controller can see
export async function activeModels() {
  let response;
  try {
    response = await fetch(`${API_URL()}v1/models`);
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching active models', error);
    return null;
  }
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

export let Endpoints: any = {};

// We do this because the API does not like slashes in the URL
function convertSlashInUrl(url: string) {
  return url.replace(/\//g, '~~~');
}

Endpoints.Tasks = {
  List: () => API_URL() + 'tasks/list',
  ListByType: (type: string) => API_URL() + 'tasks/list_by_type?type=' + type,
  ListByTypeInExperiment: (type: string, experiment_id: string) =>
    API_URL() +
    'tasks/list_by_type_in_experiment?type=' +
    type +
    '&experiment_id=' +
    experiment_id,
  Queue: (id: string) => API_URL() + 'tasks/' + id + '/queue',
  GetByID: (id: string) => API_URL() + 'tasks/' + id + '/get',
  UpdateTask: (id: string) => API_URL() + 'tasks/' + id + '/update',
  NewTask: () => API_URL() + 'tasks/new_task',
  DeleteTask: (id: string) => API_URL() + 'tasks/' + id + '/delete',
};

Endpoints.Workflows = {
  List: () => API_URL() + 'workflows/list',
  CreateEmpty: (name: string, experimentId: string) =>
    API_URL() +
    'workflows/create_empty' +
    '?name=' +
    name +
    '&experiment_id=' +
    experimentId,
  DeleteWorkflow: (workflowId: string) =>
    API_URL() + 'workflows/delete/' + workflowId,
  AddNode: (workflowId: string, node: string) =>
    API_URL() + 'workflows/' + workflowId + '/add_node' + '?node=' + node,
  DeleteNode: (workflowId: string, nodeId: string) =>
    API_URL() + 'workflows/' + workflowId + '/' + nodeId + '/delete_node',
  UpdateNode: (workflowId: string, nodeId: string, node: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/' +
    nodeId +
    '/update_node' +
    '?node=' +
    node,
  EditNodeMetadata: (workflowId: string, nodeId: string, metadata: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/' +
    nodeId +
    '/edit_node_metadata' +
    '?metadata=' +
    metadata,
  AddEdge: (workflowId: string, from: string, to: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/' +
    from +
    '/add_edge' +
    '?end_node_id=' +
    to,
  RemoveEdge: (workflowId: string, start_node_id: string, to: string) =>
    API_URL() +
    'workflows/' +
    workflowId +
    '/' +
    start_node_id +
    '/remove_edge' +
    '?end_node_id=' +
    to,
  RunWorkflow: (workflowId: string) =>
    API_URL() + 'workflows/' + workflowId + '/start',
  ListRuns: () => API_URL() + 'workflows/list_runs',
};

Endpoints.Dataset = {
  Gallery: () => API_URL() + 'data/gallery',
  Info: (datasetId: string) => API_URL() + 'data/info?dataset_id=' + datasetId,
  Preview: (
    datasetId: string,
    split: string = '',
    offset: number = 0,
    limit: number = 10,
  ) =>
    API_URL() +
    'data/preview?dataset_id=' +
    datasetId +
    '&split=' +
    split +
    '&offset=' +
    offset +
    '&limit=' +
    limit,
  PreviewWithTemplate: (
    datasetId: string,
    template: string,
    offset: number,
    limit: number,
  ) =>
    API_URL() +
    'data/preview_with_template?dataset_id=' +
    datasetId +
    '&template=' +
    template +
    '&offset=' +
    offset +
    '&limit=' +
    limit,
  Delete: (datasetId: string) =>
    API_URL() + 'data/delete?dataset_id=' + datasetId,
  Create: (datasetId: string) => API_URL() + 'data/new?dataset_id=' + datasetId,
  Download: (datasetId: string, configName?: string) =>
    API_URL() +
    'data/download?dataset_id=' +
    datasetId +
    (configName ? '&config_name=' + configName : ''),
  LocalList: (generated: boolean = true) =>
    API_URL() + 'data/list?generated=' + generated,
  GeneratedList: () => API_URL() + 'data/generated_datasets_list',
  FileUpload: (datasetId: string) =>
    API_URL() + 'data/fileupload?dataset_id=' + datasetId,
};

Endpoints.Models = {
  LocalList: () => API_URL() + 'model/list',
  CountDownloaded: () => API_URL() + 'model/count_downloaded',
  Gallery: () => API_URL() + 'model/gallery',
  GetPeftsForModel: () => API_URL() + 'model/pefts',
  UploadModelToHuggingFace: (
    modelId: string,
    modelName: string,
    organizationName?: string,
    model_card_data?: object,
  ) =>
    API_URL() +
    'model/upload_to_huggingface?model_id=' +
    modelId +
    '&model_name=' +
    modelName +
    '&organization_name=' +
    organizationName +
    '&model_card_data=' +
    JSON.stringify(model_card_data),
  DeletePeft: (modelId: string, peft: string) =>
    API_URL() + 'model/delete_peft?model_id=' + modelId + '&peft=' + peft,
  ModelDetailsFromGallery: (modelId: string) =>
    API_URL() + 'model/gallery/' + convertSlashInUrl(modelId),
  ModelDetailsFromFilesystem: (modelId: string) =>
    API_URL() + 'model/details/' + convertSlashInUrl(modelId),
  ModelProvenance: (modelId: string) =>
    API_URL() + 'model/provenance/' + convertSlashInUrl(modelId),
  GetLocalHFConfig: (modelId: string) =>
    API_URL() + 'model/get_local_hfconfig?model_id=' + modelId,
  SearchForLocalUninstalledModels: (path: string) =>
    API_URL() + 'model/list_local_uninstalled?path=' + path,
  ImportFromSource: (modelSource: string, modelId: string) =>
    API_URL() +
    'model/import_from_source?model_source=' +
    modelSource +
    '&model_id=' +
    modelId,

  ImportFromLocalPath: (modelPath: string) =>
    API_URL() + 'model/import_from_local_path?model_path=' + modelPath,
  HuggingFaceLogin: () => API_URL() + 'model/login_to_huggingface',
  Delete: (modelId: string) => API_URL() + 'model/delete?model_id=' + modelId,
  wandbLogin: () => API_URL() + 'model/login_to_wandb',
  testWandbLogin: () => API_URL() + 'model/test_wandb_login',
};

Endpoints.Plugins = {
  Gallery: () => API_URL() + 'plugins/gallery',
  Info: (pluginId: string) => API_URL() + 'plugins/info?plugin_id=' + pluginId,
  Preview: (pluginId: string) =>
    API_URL() + 'plugins/preview?pluginId=' + pluginId,
  List: () => API_URL() + 'plugins/list',
};

Endpoints.Config = {
  Get: (key: string) => API_URL() + 'config/get/' + key,
  Set: (key: string, value: string) =>
    API_URL() + 'config/set?k=' + key + '&v=' + value,
};

Endpoints.Documents = {
  List: (experimentId: string, currentFolder: string = '') =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/list?folder=' +
    currentFolder,
  Open: (experimentId: string, document_name: string, folder: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/open/' +
    document_name +
    '?folder=' +
    folder,
  Upload: (experimentId: string, currentFolder: string = '') =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/upload?folder=' +
    currentFolder,
  Delete: (experimentId: string, document_name: string, folder: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/delete?document_name=' +
    document_name +
    '&folder=' +
    folder,
  CreateFolder: (experimentId: string, folderName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/create_folder?name=' +
    folderName,
  UploadLinks: (experimentId: string, folderName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/documents/upload_links?folder=' +
    folderName,
};

Endpoints.Rag = {
  Query: (
    experimentId: string,
    model_name: string,
    query: string,
    settings: string,
    ragFolder: string = 'rag',
  ) =>
    API_URL() +
    `experiment/${experimentId}/rag/query?model=${model_name}&query=${query}&settings=${settings}&rag_folder=${ragFolder}`,
  ReIndex: (experimentId: string, folderName: string = 'rag') =>
    API_URL() +
    `experiment/${experimentId}/rag/reindex?rag_folder=${folderName}`,
  Embeddings: (experimentId: string) =>
    API_URL() + `experiment/${experimentId}/rag/embed`,
};

Endpoints.Prompts = {
  List: () => API_URL() + 'prompts/list',
  New: () => API_URL() + 'prompts/new',
  Delete: (promptId: string) => API_URL() + 'prompts/delete/' + promptId,
};

Endpoints.BatchedPrompts = {
  List: () => API_URL() + 'batch/list',
  New: () => API_URL() + 'batch/new',
  Delete: (promptId: string) => API_URL() + 'batch/delete/' + promptId,
};

Endpoints.Tools = {
  Call: (function_name: string, function_arguments: string) =>
    API_URL() + `tools/call/${function_name}?params=${function_arguments}`,
  Prompt: () => API_URL() + `tools/prompt`,
  List: () => API_URL() + `tools/list`,
};

Endpoints.Recipes = {
  Import: (name: string) =>
    API_URL() + 'train/template/import?name=' + encodeURIComponent(name),
  Export: (template_id: int) =>
    API_URL() + 'train/template/' + template_id + '/export',
  Gallery: () => API_URL() + 'train/template/gallery',
};

Endpoints.ServerInfo = {
  Get: () => API_URL() + 'server/info',
  PythonLibraries: () => API_URL() + 'server/python_libraries',
  StreamLog: () => API_URL() + 'server/stream_log',
};

Endpoints.Charts = {
  CompareEvals: (jobIds: string) =>
    API_URL() + 'evals/compare_evals?job_list=' + jobIds,
};

export function GET_TRAINING_TEMPLATE_URL() {
  return API_URL() + 'train/templates';
}

export function CREATE_TRAINING_JOB_URL(
  template_id: string,
  experiment_id: string,
) {
  return (
    API_URL() +
    'train/job/create?template_id=' +
    template_id +
    '&description=description' +
    '&experiment_id=' +
    experiment_id
  );
}

Endpoints.Experiment = {
  GetAll: () => API_URL() + 'experiment',
  UpdateConfig: (id: string, key: string, value: string) =>
    API_URL() +
    'experiment/' +
    id +
    '/update_config' +
    '?key=' +
    key +
    '&value=' +
    encodeURIComponent(value),
  Create: (name: string) => API_URL() + 'experiment/create?name=' + name,
  Get: (id: string) => API_URL() + 'experiment/' + id,
  Delete: '',
  SavePrompt: '',
  GetFile: (id: string, filename: string) =>
    API_URL() + 'experiment/' + id + '/file_contents?filename=' + filename,
  SaveFile: (id: string, filename: string) =>
    API_URL() + 'experiment/' + id + '/save_file_contents?filename=' + filename,
  GetPlugin: (id: string, plugin_name: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/evals/get_evaluation_plugin_file_contents?plugin_name=' +
      plugin_name
    );
  },
  GetGenerationPlugin: (id: string, plugin_name: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/generations/get_evaluation_plugin_file_contents?plugin_name=' +
      plugin_name
    );
  },
  RunEvaluation: (id: string, pluginName: string, evalName: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/evals/run_evaluation_script?eval_name=' +
      evalName +
      '&plugin_name=' +
      pluginName
    );
  },
  RunGeneration: (id: string, pluginName: string, evalName: string) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/generations/run_generation_script?generation_name=' +
      evalName +
      '&plugin_name=' +
      pluginName
    );
  },
  DeleteEval: (experimentId: string, evalName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/evals/delete' +
    '?eval_name=' +
    evalName,
  DeleteGeneration: (experimentId: string, evalName: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/generations/delete' +
    '?generation_name=' +
    evalName,
  GetEvalOutput: (experimentId: string, eval_name: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/evals/get_output' +
    '?eval_name=' +
    eval_name,
  GetGenerationOutput: (experimentId: string, eval_name: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/generations/get_output' +
    '?eval_name=' +
    eval_name,
  RunExport: (
    id: string,
    pluginName: string,
    pluginArchitecture: string,
    pluginParams: string,
  ) => {
    return (
      API_URL() +
      'experiment/' +
      id +
      '/export/run_exporter_script?plugin_name=' +
      pluginName +
      '&plugin_architecture=' +
      pluginArchitecture +
      '&plugin_params=' +
      pluginParams
    );
  },
  GetExportJobs: (id: string) => {
    return API_URL() + 'experiment/' + id + '/export/jobs';
  },
  GetExportJobDetails: (experimentId: string, jobId: string) => {
    return (
      API_URL() + 'experiment/' + experimentId + '/export/job?jobId=' + jobId
    );
  },
  SaveConversation: (experimentId: String) =>
    API_URL() + 'experiment/' + experimentId + '/conversations/save',
  GetConversations: (experimentId: string) =>
    FULL_PATH('experiment/' + experimentId + '/conversations/list'),
  DeleteConversation: (experimentId: string, conversationId: string) =>
    FULL_PATH(
      'experiment/' +
        experimentId +
        '/conversations/delete?conversation_id=' +
        conversationId,
    ),
  InstallPlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/install_plugin_to_experiment' +
    '?plugin_name=' +
    pluginId,
  DeletePlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/delete_plugin_from_experiment' +
    '?plugin_name=' +
    pluginId,
  ListScripts: (experimentId: string) =>
    FULL_PATH('experiment/' + experimentId + '/plugins/list'),
  ListScriptsOfType: (
    experimentId: string,
    type: string,
    filter: string | null = null,
  ) =>
    FULL_PATH(
      'experiment/' +
        experimentId +
        '/plugins/list?type=' +
        type +
        (filter ? '&filter=' + filter : ''),
    ),
  ScriptListFiles: (experimentId: string, id: string) =>
    API_URL() + 'experiment/' + experimentId + '/plugins/' + id + '/list_files',
  ScriptGetFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/' +
    pluginId +
    '/file_contents?filename=' +
    filename,
  ScriptNewFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/' +
    pluginId +
    '/create_new_file?filename=' +
    filename,
  ScriptDeleteFile: (
    experimentId: string,
    pluginId: string,
    filename: string,
  ) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/' +
    pluginId +
    '/delete_file?filename=' +
    filename,
  ScriptSaveFile: (experimentId: string, pluginId: string, filename: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/' +
    pluginId +
    '/save_file_contents?filename=' +
    filename,
  ScriptCreateNew: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    '/plugins/new_plugin?pluginId=' +
    pluginId,
  ScriptDeletePlugin: (experimentId: string, pluginId: string) =>
    API_URL() +
    'experiment/' +
    experimentId +
    'plugins/delete_plugin?pluginId=' +
    pluginId,
  GetOutputFromJob: (jobId: string) => API_URL() + `train/job/${jobId}/output`,
  StreamOutputFromTrainingJob: (jobId: string) =>
    API_URL() + `train/job/${jobId}/stream_output`,
  StreamOutputFromJob: (jobId: string) =>
    API_URL() + `jobs/${jobId}/stream_output`,
  StreamDetailedJSONReportFromJob: (jobId: string, fileName: string) =>
    API_URL() +
    `jobs/${jobId}/stream_detailed_json_report?file_name=${fileName}`,
  GetAdditionalDetails: (jobId: string, task: string = 'view') =>
    API_URL() + `jobs/${jobId}/get_additional_details?task=${task}`,
  GetGeneratedDataset: (jobId: string) =>
    API_URL() + `jobs/${jobId}/get_generated_dataset`,
  GetPlotJSON: (jobId: string) => API_URL() + `jobs/${jobId}/get_figure_json`,
};

Endpoints.Jobs = {
  List: () => API_URL() + 'jobs/list',
  Get: (jobId: string) => API_URL() + 'train/job/' + jobId,
  Create: (
    experimentId?: string,
    type?: string,
    status?: string,
    data?: string, //Should be JSON
  ) =>
    API_URL() +
    'jobs/create' +
    '?status=' +
    (status ? status : 'CREATED') +
    (experimentId ? '&experiment_id=' + experimentId : '') +
    (type ? '&type=' + type : '') +
    (data ? '&data=' + data : ''),
  GetJobsOfType: (type: string = '', status: string = '') =>
    API_URL() + 'jobs/list' + '?type=' + type + '&status=' + status,
  Delete: (jobId: string) => API_URL() + 'jobs/delete/' + jobId,
  GetTrainingTemplate: (template_id: string) =>
    API_URL() + 'jobs/template/' + template_id,
  UpdateTrainingTemplate: (
    template_id: string,
    name: string,
    description: string,
    type: string,
    config: Object,
  ) =>
    API_URL() +
    'jobs/template/update' +
    '?template_id=' +
    template_id +
    '&name=' +
    name +
    '&description=' +
    description +
    '&type=' +
    type +
    '&config=' +
    config,
  Stop: (jobId: string) => API_URL() + 'jobs/' + jobId + '/stop',
};

Endpoints.Global = {
  PromptLog: () => API_URL() + 'prompt_log',
};

export function GET_EXPERIMENTS_URL() {
  if (API_URL() === null) {
    return null;
  }
  return API_URL() + 'experiment/';
}

export function GET_EXPERIMENT_UPDATE_CONFIG_URL(
  id: string,
  key: string,
  value: string | undefined,
) {
  if (value === undefined) {
    value = '';
  }
  return (
    API_URL() +
    'experiment/' +
    id +
    '/update_config' +
    '?key=' +
    key +
    '&value=' +
    value
  );
}

export async function EXPERIMENT_ADD_EVALUATION(
  id: string,
  name: string,
  pluginId: string,
  scriptParameters: any,
) {
  const newPlugin = {
    name: name,
    plugin: pluginId,
    script_parameters: scriptParameters,
  };

  const response = await fetch(API_URL() + 'experiment/' + id + '/evals/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(newPlugin),
  });
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_EDIT_EVALUATION(
  id: string,
  evalName: string,
  scriptParameters: any,
) {
  const newPlugin = {
    evalName: evalName,
    script_parameters: scriptParameters,
  };

  const response = await fetch(API_URL() + 'experiment/' + id + '/evals/edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(newPlugin),
  });
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_ADD_GENERATION(
  id: string,
  name: string,
  pluginId: string,
  scriptParameters: any,
) {
  const newPlugin = {
    name: name,
    plugin: pluginId,
    script_parameters: scriptParameters,
  };

  const response = await fetch(
    API_URL() + 'experiment/' + id + '/generations/add',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export async function EXPERIMENT_EDIT_GENERATION(
  id: string,
  evalName: string,
  scriptParameters: any,
) {
  const newPlugin = {
    evalName: evalName,
    script_parameters: scriptParameters,
  };

  const response = await fetch(
    API_URL() + 'experiment/' + id + '/generations/edit',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(newPlugin),
    },
  );
  const result = await response.json();
  return result;
}

export function CREATE_EXPERIMENT_URL(name: string) {
  return API_URL() + 'experiment/create?name=' + name;
}

export function GET_EXPERIMENT_URL(id: string) {
  if (id === '') {
    return '';
  }
  return API_URL() + 'experiment/' + id;
}

export function DELETE_EXPERIMENT_URL(id: string) {
  return API_URL() + 'experiment/' + id + '/delete';
}

export function SAVE_EXPERIMENT_PROMPT_URL(id: string) {
  return API_URL() + 'experiment/' + id + '/prompt';
}

// Right now health function is the same as activeModels
// But later we can add a health endpoint to the API
export async function apiHealthz() {
  let response;
  try {
    response = await fetch(`${API_URL()}healthz`);
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching API', error);
    return null;
  }
}

export async function controllerHealthz() {
  let response;
  try {
    // For now we hard code the worker to the default FastChat API port of 21002
    response = await fetch(API_URL() + 'v1/models', {
      method: 'GET',
    });
    if (response.ok) {
      const result = await response.json();
      return result;
    }
    return null;
  } catch (error) {
    console.log('error with fetch', error);
    return null;
  }
}

export async function localaiHealthz() {
  let response;
  try {
    response = await fetch(API_URL() + 'v1/models');
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetch', error);
    return null;
  }
}

export async function getComputerInfo() {
  let response;
  try {
    response = await fetch(API_URL() + 'server/info');
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with fetching computer info', error);
    return null;
  }
}

export function activateLocalAI(): void {
  window.electron.ipcRenderer.sendMessage('spawn-start-localai');
}

export async function activateController() {
  let response;
  try {
    response = await fetch(API_URL() + 'server/controller_start');
    // console.log('response ok?' + response.ok);
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with starting controller', error);
    return undefined;
  }
}

export async function activateWorker(
  modelName: string,
  modelFilename: string | null = null,
  adaptorName: string = '',
  engine: string | null = 'default',
  parameters: object = {},
  experimentId: string = '',
) {
  let response;

  let model = modelName;
  // if (adaptorName !== '') {
  //   model = `workspace/adaptors/${modelName}/${adaptorName}`;
  // }

  if (modelFilename !== null) {
    model = `${model}&model_filename=${modelFilename}`;
  }

  const paramsJSON = JSON.stringify(parameters);

  try {
    response = await fetch(
      API_URL() +
        'server/worker_start?model_name=' +
        model +
        '&adaptor=' +
        adaptorName +
        '&engine=' +
        engine +
        '&experiment_id=' +
        experimentId +
        '&parameters=' +
        paramsJSON,
    );
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with starting worker api call ', error);
    return undefined;
  }
}

export async function killWorker() {
  let response;
  try {
    response = await fetch(API_URL() + 'server/worker_stop');
    const result = await response.json();
    return result;
  } catch (error) {
    console.log('error with killing worker api call ', error);
    return undefined;
  }
}

export function activateTransformerLabAPI(): void {
  window.electron.ipcRenderer.sendMessage('spawn-start-transformerlab-api');
}

export async function startFinetune(
  modelName: string,
  adaptorName: string,
  trainingData: string,
) {
  const response = await fetch(
    `${API_URL()}train/finetune_lora?model=${modelName}&adaptor_name=${adaptorName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(trainingData),
    },
  );
  const result = await response.json();
  return result;
}

export function TEMPLATE_FOR_MODEL_URL(model: string) {
  return `${API_URL()}model/get_conversation_template?model=${model}`;
}

export async function getTemplateForModel(modelName: string) {
  if (!modelName) {
    return null;
  }
  const model = modelName.split('/')[1];
  const response = await fetch(TEMPLATE_FOR_MODEL_URL(model));
  const result = await response.json();

  return result;
}

/** ***********************
 * TRAINING AND TRAINING JOBS
 */

export async function saveTrainingTemplate(
  name: string,
  description: string,
  type: string,
  config: string,
) {
  // template_id: str, description: str, type: str, datasets: str, config: str

  const queryString = `?name=${name}&description=${description}&type=${type}`;

  const configBody = {
    config: config,
  };
  const response = await fetch(
    API_URL() + 'train/template/create' + queryString,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(configBody),
    },
  );
  const result = await response.json();
  return result;
}
export async function getTrainingJobs() {
  const response = await fetch(API_URL() + 'train/list');
  const result = await response.json();
  return result;
}

export async function getTrainingJobStatus(jobId: string) {
  const response = await fetch(API_URL() + 'train/status?job_id=' + jobId);
  const result = await response.json();
  return result;
}

/**
 * SWR hooks
 */

const fetcher = (...args: any[]) =>
  fetch(...args).then((res) => {
    if (!res.ok) {
      const error = new Error('An error occurred fetching ' + res.url);
      error.response = res.json();
      error.status = res.status;
      console.log(res);
      throw error;
    }
    return res.json();
  });

export function useModelStatus() {
  const api_url = API_URL();
  const url = api_url ? api_url + 'server/worker_healthz' : null;

  // Poll every 2 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, error, isLoading, mutate } = useSWR(url, fetcher, options);

  if (error || data?.length === 0) {
    data = null;
  }

  return {
    models: data,
    isLoading,
    isError: error,
    mutate: mutate,
  };
}

export function usePluginStatus(experimentInfo: any) {
  const { data, isLoading, mutate } = useSWR(
    experimentInfo
      ? Endpoints.Experiment.ListScripts(experimentInfo?.id)
      : null,
    fetcher,
  );

  let outdatedPlugins = [];
  if (data) {
    outdatedPlugins = data.filter(
      (plugin: any) =>
        plugin?.gallery_version && plugin?.version != plugin?.gallery_version,
    );
  }

  return { data: outdatedPlugins, isLoading, mutate };
}

export function useServerStats() {
  const api_url = API_URL();
  const url = api_url ? API_URL() + 'server/info' : null;

  // Poll every 1 seconds
  const options = { refreshInterval: 2000 };

  // eslint-disable-next-line prefer-const
  let { data, error, isLoading } = useSWR(url, fetcher, options);

  return {
    server: data,
    isLoading,
    isError: error,
  };
}

export async function downloadPlugin(pluginId: string) {
  const response = await fetch(
    API_URL() + 'plugins/download?plugin_slug=' + pluginId,
  );
  const result = await response.json();
  return result;
}

const fetchAndGetErrorStatus = async (url) => {
  console.log('🛎️fetching', url);

  const res = await fetch(url);

  // console.log('🛎️fetched', res);

  // If the status code is not in the range 200-299,
  // we still try to parse and throw it.
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    // Attach extra info to the error object.
    // error.info = await res.json(); //uncommenting this line breaks the error handling -- not sure why
    error.status = res.status;
    throw error;
  }

  return res.json();
};

/**
 * Check your localhost to see if the server is active
 */
export function useCheckLocalConnection() {
  const url = 'http://localhost:8338/' + 'server/info';

  // Poll every 2 seconds
  const options = {
    refreshInterval: 500,
    refreshWhenOffline: true,
    refreshWhenHidden: true,
    shouldRetryOnError: true,
    errorRetryInterval: 500,
    errorRetryCount: 1000,
  };

  // eslint-disable-next-line prefer-const
  let { data, error, mutate } = useSWR(url, fetchAndGetErrorStatus, options);

  return {
    server: data,
    error: error,
    mutate: mutate,
  };
}
