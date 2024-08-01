/* eslint-disable jsx-a11y/anchor-is-valid */
import { useRef, useEffect, useState } from 'react';

import useSWR from 'swr';

import Sheet from '@mui/joy/Sheet';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { PencilIcon, PlayIcon } from 'lucide-react';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Textarea,
  Typography,
} from '@mui/joy';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Embeddings({ experimentInfo }) {
  const { models, isError, isLoading } = chatAPI.useModelStatus();

  async function getEmbeddings() {
    const text = document.getElementsByName('inputText')[0].value;
    const lines = text.split('\n');

    const model_name = experimentInfo?.config?.foundation;

    let embeddings = await chatAPI.getEmbeddings(model_name, lines);
    embeddings = embeddings?.data;

    //expand embeddings subproperty embedding array to string:
    embeddings = embeddings?.map((item) => {
      return item.embedding;
    });

    embeddings = embeddings?.join('\n\n\n');

    document.getElementById('embeddingsResult').innerHTML = embeddings;
  }

  if (!experimentInfo) return 'Select an Experiment';
  if (!models?.[0]?.id) return 'No Model is Running';

  return (
    <>
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
        <Typography level="h1" mb={3}>
          Generate Embeddings
        </Typography>
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
            onClick={async () => await getEmbeddings()}
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
    </>
  );
}
