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
} from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function Tokenization() {
  const { experimentInfo } = useExperimentInfo();
  const [inputText, setInputText] = useState('');
  const [tokenizedResult, setTokenizedResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleTokenize = async () => {
    if (!inputText.trim()) return;

    setLoading(true);
    setError(null);
    setTokenizedResult(null);

    try {
      const response = await chatAPI.authenticatedFetch(
        `${chatAPI.Endpoints.Tokenize}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Team-Id': experimentInfo?.team_id,
          },
          body: JSON.stringify({
            text: inputText,
            experiment_id: experimentInfo?.id,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Tokenization failed: ${response.statusText}`);
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
        Enter text below to see how it gets tokenized by the current
        experiment's model.
      </Typography>

      <Textarea
        placeholder="Enter text to tokenize..."
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        minRows={4}
        maxRows={10}
      />

      <Button
        onClick={handleTokenize}
        disabled={!inputText.trim() || loading}
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
