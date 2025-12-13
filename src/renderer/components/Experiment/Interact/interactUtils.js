import { fetchWithAuth } from 'renderer/lib/authContext';
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
  const configResp = await fetchWithAuth(
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
