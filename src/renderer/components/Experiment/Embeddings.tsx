/* eslint-disable jsx-a11y/anchor-is-valid */
import { useRef, useEffect, useState } from 'react';

import useSWR from 'swr';

import Sheet from '@mui/joy/Sheet';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { PencilIcon, PlayIcon } from 'lucide-react';
import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Textarea,
  Typography,
} from '@mui/joy';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Embeddings({ model_name }) {
  async function getEmbeddings() {
    const text = document.getElementsByName('inputText')[0].value;
    const lines = text.split('\n');

    let embeddings = await chatAPI.getEmbeddings(model_name, lines);
    embeddings = embeddings.data;

    //expand embeddings subproperty embedding array to string:
    embeddings = embeddings.map((item) => {
      return item.embedding;
    });

    embeddings = embeddings.join('\n\n\n');

    document.getElementsByName('outputText')[0].value = embeddings;
  }

  return (
    <>
      <Sheet>
        <Typography level="h1" mb={3}>
          Generate Embeddings
        </Typography>

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

        <FormControl>
          <FormLabel>Output Vectors</FormLabel>
          <Textarea
            minRows={8}
            maxRows={20}
            size="lg"
            name="outputText"
            sx={{ whiteSpace: 'nowrap' }}
          />
        </FormControl>
      </Sheet>
    </>
  );
}
