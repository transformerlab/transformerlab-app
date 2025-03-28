/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { LightbulbIcon, PlayIcon } from 'lucide-react';
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
  const { models, isError, isLoading } = chatAPI.useModelStatus();

  async function getEmbeddings() {
    try {
      const text = document.getElementsByName('inputText')[0].value;

      // Use experiment id from experimentInfo
      const experimentId = experimentInfo?.id;

      if (!experimentId) {
        document.getElementById('embeddingsResult').innerHTML =
          'Error: No experiment ID found';
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

      document.getElementById('embeddingsResult').innerHTML = embeddingsText;
    } catch (error) {
      console.error('Error generating embeddings:', error);
      document.getElementById('embeddingsResult').innerHTML =
        `Error: ${error?.message}`;
    }
  }

  if (!experimentInfo) return 'Select an Experiment';
  if (!models?.[0]?.id) return 'No Model is Running';

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
          />

          <FormHelperText>
            Enter text to convert, one input per line.
          </FormHelperText>
        </FormControl>
        <Button
          sx={{ mt: 4, mb: 4 }}
          startDecorator={<PlayIcon />}
          onClick={async () => getEmbeddings()}
        >
          Process Embeddings
        </Button>
      </div>
      <div>
        <FormControl>
          <FormLabel>Output Vectors</FormLabel>
          <Sheet
            id="embeddingsResult"
            variant="soft"
            color="neutral"
            sx={{ padding: 1, overflow: 'hidden' }}
          />
        </FormControl>
      </div>
    </Sheet>
  );
}
