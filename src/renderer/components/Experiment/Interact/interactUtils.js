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

export async function getMcpServerFile() {
  const configResp = await fetch(
    chatAPI.getAPIFullPath('config', ['get'], { key: 'MCP_SERVER' }),
  );
  const configData = await configResp.json();
  if (configData) {
    try {
      const parsed = JSON.parse(configData);
      return {
        mcp_server_file: parsed.serverName || '',
        mcp_args: parsed.args || '',
        mcp_env: parsed.env || '',
      };
    } catch {
      return { mcp_server_file: '', mcp_args: '', mcp_env: '' };
    }
  }
  return { mcp_server_file: '', mcp_args: '', mcp_env: '' };
}

// Get the System Message from the backend.
// Returns a default prompt if there was an error.
export async function getAgentSystemMessage() {
  const { mcp_server_file, mcp_args, mcp_env } = await getMcpServerFile();
  let url = chatAPI.Endpoints.Tools.Prompt();
  const params = [];
  if (mcp_server_file)
    params.push(`mcp_server_file=${encodeURIComponent(mcp_server_file)}`);
  if (mcp_args) params.push(`mcp_args=${encodeURIComponent(mcp_args)}`);
  if (mcp_env) params.push(`mcp_env=${encodeURIComponent(mcp_env)}`);
  if (params.length > 0) {
    url += (url.includes('?') ? '&' : '?') + params.join('&');
  }
  const prompt = await fetch(url)
    .then((res) => res.json())
    .catch((error) => 'You are a helpful chatbot assistant.');
  return prompt;
}
