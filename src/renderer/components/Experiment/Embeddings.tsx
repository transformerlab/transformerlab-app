/* eslint-disable no-console */
/* eslint-disable jsx-a11y/anchor-is-valid */

import { useState } from 'react';
import Sheet from '@mui/joy/Sheet';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { LightbulbIcon, PlayIcon, ClipboardIcon } from 'lucide-react';
import {
  Alert,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Textarea,
  Typography,
} from '@mui/joy';

export default function Embeddings({ experimentInfo }) {
  const [embeddingsResult, setEmbeddingsResult] = useState('');

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(embeddingsResult)
      .then(() => {
        console.log('Embeddings copied to clipboard');
        return true;
      })
      .catch((err) => {
        console.error('Failed to copy embeddings:', err);
      });
  };

  async function getEmbeddings() {
    try {
      const text = document.getElementsByName('inputText')[0].value;

      // Use experiment id from experimentInfo
      const experimentId = experimentInfo?.id;

      if (!experimentId) {
        setEmbeddingsResult('Error: No experiment ID found');
        return;
      }

      const requestData = {
        experiment_id: String(experimentId),
        text,
      };

      const response = await fetch(
        chatAPI.Endpoints.Rag.Embeddings(experimentId),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        },
      );

      // Get the response text for debugging
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`API error: ${response.status} - ${responseText}`);
      }

      // Parse the response text to JSON
      const result = JSON.parse(responseText);

      // Process the new response format
      const embeddings = result?.embeddings || [];

      // Convert embeddings to string format
      const embeddingsText = embeddings
        .map((embedding: any) => JSON.stringify(embedding))
        .join('\n\n\n');

      setEmbeddingsResult(embeddingsText);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      setEmbeddingsResult(`Error: ${error?.message}`);
    }
  }

  if (!experimentInfo) return 'Select an Experiment';

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        marginBottom: '1rem',
        paddingBottom: '1rem',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Alert variant="plain" startDecorator={<LightbulbIcon />}>
        <Typography level="body-sm" textColor="text.tertiary" fontWeight={400}>
          Embeddings are used to convert words, characters, or subwords into
          numerical vectors that capture their semantic meaning. The resulting
          embedding vectors can be used to compare the meaning of chunks of
          text.
        </Typography>
      </Alert>
      <div>
        <FormControl>
          <FormLabel>Input Text</FormLabel>
          <Textarea
            minRows={8}
            size="lg"
            defaultValue="This is a line
This is a second line."
            name="inputText"
            maxRows={10}
            sx={{ marginRight: 1 }}
          />

          <FormHelperText>
            Enter text to convert, one input per line.
          </FormHelperText>
        </FormControl>
        <Button
          sx={{ my: 2 }}
          startDecorator={<PlayIcon />}
          onClick={async () => getEmbeddings()}
        >
          Process Embeddings
        </Button>
      </div>
      <div>
        <FormControl
          sx={{ alignItems: 'flex-start', width: '100%', overflow: 'hidden' }}
        >
          <FormLabel>
            Output Vectors (Embedding Model:{' '}
            {experimentInfo?.config?.embedding_model})
          </FormLabel>

          <Sheet
            variant="soft"
            color="neutral"
            sx={{
              padding: 1,
              overflowX: 'hidden',
              overflowY: 'auto',
              minHeight: '8rem',
              maxHeight: '20rem',
              maxWidth: '90%',
            }}
          >
            {embeddingsResult}
          </Sheet>
          <Button
            size="sm"
            variant="plain"
            onClick={copyToClipboard}
            startDecorator={<ClipboardIcon />}
            sx={{ mt: 1, justifyContent: 'flex-start' }}
          >
            Copy to Clipboard
          </Button>
        </FormControl>
      </div>
    </Sheet>
  );
}
