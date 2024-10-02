import * as chatAPI from '../../../lib/transformerlab-api-sdk';

export function scrollChatToBottom() {
  setTimeout(() => document.getElementById('endofchat')?.scrollIntoView(), 1);
}

export function focusChatInput() {
  setTimeout(() => {
    if (document.getElementById('chat-input')) {
      document.getElementById('chat-input').focus();
    }
  }, 100);
}

// Get the System Message from the backend.
// Returns a default prompt if there was an error.
export async function getAgentSystemMessage() {
  const prompt = await fetch(chatAPI.Endpoints.Tools.Prompt())
    .then((res) => res.json())
    .catch(
      // TODO: Retry? Post error message?
      // For now just returning arbitrary system message.
      (error) => 'You are a helpful chatbot assistant.'
    );
  return prompt;
}
