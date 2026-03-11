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
