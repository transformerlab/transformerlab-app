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

export default function Chat({}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { authenticatedFetch } = useAuth();

  // Scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load available models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await authenticatedFetch(
          chatAPI.Endpoints.Models.LocalList(),
        );
        const models = await response.json();
        const modelIds = models.map((model: any) => model.model_id);
        setAvailableModels(modelIds);
        if (modelIds.length > 0 && !selectedModel) {
          setSelectedModel(modelIds[0]);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };

    loadModels();
  }, [authenticatedFetch, selectedModel]);

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
      const chatMessages = messages.concat(userMessage).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await authenticatedFetch(
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
          content: data.choices[0].message.content,
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
          onKeyPress={handleKeyPress}
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
