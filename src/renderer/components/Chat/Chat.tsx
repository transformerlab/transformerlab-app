import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Textarea,
  Typography,
  Sheet,
  Stack,
  CircularProgress,
  Select,
  Option,
  FormControl,
  FormLabel,
} from '@mui/joy';
import { SendIcon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatProps {}

interface LocalModel {
  model_id: string;
}

interface HFCacheModel {
  model_id: string;
  local_path: string;
  size_on_disk: number;
  nb_files: number;
}

export default function Chat({}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showHistoryWarning, setShowHistoryWarning] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { fetchWithAuth } = useAuth();

  // Scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load available models (local + HF cache)
  useEffect(() => {
    const loadModels = async () => {
      setModelLoadError(null);
      try {
        const localResponse = await fetchWithAuth(
          chatAPI.Endpoints.Models.LocalList(),
        );
        let localModelIds: string[] = [];
        if (localResponse.ok) {
          const models: LocalModel[] = await localResponse.json();
          if (Array.isArray(models)) {
            localModelIds = models.map((model) => model.model_id);
          }
        }

        // Also fetch models from HF cache
        let hfCacheModelIds: string[] = [];
        try {
          const cacheResponse = await fetchWithAuth(
            chatAPI.Endpoints.Models.HFCacheList(),
          );
          if (cacheResponse.ok) {
            const cacheModels: HFCacheModel[] = await cacheResponse.json();
            if (Array.isArray(cacheModels)) {
              hfCacheModelIds = cacheModels.map((model) => model.model_id);
            }
          }
        } catch (cacheError) {
          console.warn('Failed to load HF cache models:', cacheError);
        }

        // Combine local models and HF cache models, avoiding duplicates
        const allModelIds = [...localModelIds];
        for (const modelId of hfCacheModelIds) {
          if (!allModelIds.includes(modelId)) {
            allModelIds.push(modelId);
          }
        }

        setAvailableModels(allModelIds);
        if (allModelIds.length > 0 && !selectedModel) {
          setSelectedModel(allModelIds[0]);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        setModelLoadError('Failed to load models: ' + (error as Error).message);
      }
    };

    loadModels();
  }, [fetchWithAuth]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedModel || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const recentMessages = [...messages, userMessage].slice(-20);
      if ([...messages, userMessage].length > 20) {
        setShowHistoryWarning(true);
      }
      const chatMessages = recentMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetchWithAuth(
        chatAPI.API_URL() + 'v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: chatMessages,
            max_tokens: 1024,
            temperature: 0.7,
          }),
        },
      );

      const data = await response.json();

      if (data.choices && data.choices[0]) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.choices[0].message?.content ?? '',
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your message.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
      }}
    >
      <Typography level="h3" sx={{ mb: 2 }}>
        Chat Interface
      </Typography>

      {/* Model Selection */}
      {modelLoadError ? (
        <Typography level="body-sm" sx={{ color: 'error.main', mb: 2 }}>
          {modelLoadError}
        </Typography>
      ) : (
        <FormControl sx={{ mb: 2 }}>
          <FormLabel>Select Model</FormLabel>
          <Select
            value={selectedModel}
            onChange={(_, value) => setSelectedModel(value || '')}
          >
            {availableModels.map((model) => (
              <Option key={model} value={model}>
                {model}
              </Option>
            ))}
          </Select>
        </FormControl>
      )}

      {showHistoryWarning && (
        <Typography level="body-sm" sx={{ color: 'warning.main', mb: 1 }}>
          Note: Long conversations are truncated to recent messages for model
          context limits.
        </Typography>
      )}

      {/* Messages Area */}
      <Sheet
        variant="outlined"
        sx={{
          flex: 1,
          mb: 2,
          p: 2,
          overflowY: 'auto',
          minHeight: 400,
        }}
      >
        <Stack spacing={2}>
          {messages.length === 0 ? (
            <Typography
              level="body-sm"
              sx={{ textAlign: 'center', color: 'text.tertiary' }}
            >
              Start a conversation by typing a message below.
            </Typography>
          ) : (
            messages.map((message) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  justifyContent:
                    message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Sheet
                  variant={message.role === 'user' ? 'solid' : 'soft'}
                  color={message.role === 'user' ? 'primary' : 'neutral'}
                  sx={{
                    maxWidth: '70%',
                    p: 2,
                    borderRadius: 2,
                  }}
                >
                  <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>
                    {message.content}
                  </Typography>
                  <Typography level="body-xs" sx={{ mt: 1, opacity: 0.7 }}>
                    {message.timestamp.toLocaleTimeString()}
                  </Typography>
                </Sheet>
              </Box>
            ))
          )}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Sheet
                variant="soft"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CircularProgress size="sm" />
                <Typography level="body-sm">Thinking...</Typography>
              </Sheet>
            </Box>
          )}
          <div ref={messagesEndRef} />
        </Stack>
      </Sheet>

      {/* Input Area */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Textarea
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          minRows={2}
          maxRows={4}
          sx={{ flex: 1 }}
          disabled={isLoading}
        />
        <Button
          onClick={sendMessage}
          disabled={!input.trim() || !selectedModel || isLoading}
          startDecorator={<SendIcon />}
          sx={{ alignSelf: 'flex-end' }}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
}
