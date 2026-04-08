import React, { useState } from 'react';
import {
  Box,
  Button,
  Sheet,
  Textarea,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  Input,
  FormControl,
  FormLabel,
} from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { INFERENCE_SERVER_URL } from 'renderer/lib/api-client/urls';

export default function Tokenization() {
  const { experimentInfo } = useExperimentInfo();
  const [inputText, setInputText] = useState('');
  const [modelName, setModelName] = useState(
    experimentInfo?.config?.model_name || '',
  );
  const [tokenizedResult, setTokenizedResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleTokenize = async () => {
    if (!inputText.trim() || !modelName.trim()) return;

    setLoading(true);
    setError(null);
    setTokenizedResult(null);

    try {
      const response = await chatAPI.authenticatedFetch(
        `${INFERENCE_SERVER_URL()}tokenize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Team-Id': experimentInfo?.team_id,
          },
          body: JSON.stringify({
            text: inputText,
            model_name: modelName,
          }),
        },
      );

      if (!response.ok) {
        let errorMessage = `Tokenization failed: ${response.statusText}`;
        if (response.status === 404) {
          errorMessage =
            'Tokenization is not available for the current model or inference server.';
        } else if (response.status === 405) {
          errorMessage =
            'Tokenization endpoint does not support the requested method.';
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      setTokenizedResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        p: 2,
        gap: 2,
      }}
    >
      <Typography level="h4">Tokenization Preview</Typography>
      <Typography level="body-sm" color="neutral">
        Enter a Hugging Face model name and text below to see how it gets
        tokenized. You can use any model from Hugging Face or specify a custom
        tokenizer.
      </Typography>
      <FormControl required>
        <FormLabel>Model Name</FormLabel>
        <Input
          placeholder="e.g., microsoft/DialoGPT-small"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
        />
      </FormControl>
      <Textarea
        placeholder="Enter text to tokenize..."
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        minRows={4}
        maxRows={10}
      />
      <Button
        onClick={handleTokenize}
        disabled={!inputText.trim() || !modelName.trim() || loading}
        loading={loading}
      >
        Tokenize
      </Button>
      {error && (
        <Alert color="danger">
          <Typography level="body-sm">{error}</Typography>
        </Alert>
      )}
      {tokenizedResult && (
        <>
          <Divider />
          <Box>
            <Typography level="h5" sx={{ mb: 1 }}>
              Tokenized Output
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography level="body-sm" fontWeight="bold">
                Input IDs:
              </Typography>
              <Typography
                level="body-xs"
                sx={{
                  fontFamily: 'monospace',
                  bgcolor: 'background.level1',
                  p: 1,
                  borderRadius: 'sm',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(tokenizedResult.input_ids, null, 2)}
              </Typography>
            </Box>
            <Box>
              <Typography level="body-sm" fontWeight="bold">
                Tokens:
              </Typography>
              <Typography
                level="body-xs"
                sx={{
                  fontFamily: 'monospace',
                  bgcolor: 'background.level1',
                  p: 1,
                  borderRadius: 'sm',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(tokenizedResult.tokens, null, 2)}
              </Typography>
            </Box>
          </Box>
        </>
      )}
    </Sheet>
  );
}
