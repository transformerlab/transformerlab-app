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
  Stack,
  Textarea,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useState } from 'react';
import { colorArray, mixColorWithBackground } from 'renderer/lib/utils';

// array of 5 pastel colours for the rainbow effect:
const colourArray = colorArray;
// const colourArray = ['#e9fcf1', '#f2e0fc', '#f6f3d8', '#d4effc', '#fbcae0'];

function singleWordElement(word, tokenID, i) {
  return (
    <Tooltip title={tokenID} arrow>
      <span
        key={i}
        style={{
          backgroundColor: mixColorWithBackground(
            colourArray[i % colourArray.length],
          ),
          color: 'var(--joy-palette-text-primary)',
        }}
      >
        {word}
      </span>
    </Tooltip>
  );
}

const SPACE_TOKENS = ['Ġ', '▁'];
const NEWLINE_TOKENS = ['Ċ', '<0x0A>', '\n'];
const SPACE_AND_NEWLINE_TOKENS = SPACE_TOKENS.concat(NEWLINE_TOKENS);

function makeRainbowTextFromArray(arr) {
  let result = [];

  for (let i = 0; i < arr.length; i++) {
    let word = arr[i][0];

    // Ġ is &nbsp;
    // Ċ is newline
    // Break up the word into an array of parts that are either Ġ, Ċ or any other text
    // So for example the string "Ġ[];ĊĊ" would be split into ["Ġ", "[];", "Ċ", "Ċ"]
    // word = word.split(/(Ġ|Ċ|▁)/);
    // do the same as above but use the SPACE_AND_NEWLINE_TOKENS array:

    word = word.split(new RegExp(`(${SPACE_AND_NEWLINE_TOKENS.join('|')})`));
    // Remove any empty strings:
    word = word.filter((w) => w !== '');

    let thisWord = '';
    for (let j = 0; j < word.length; j++) {
      // if word[j] is Ġ or Ċ, add a space:
      if (SPACE_TOKENS.includes(word[j])) {
        // result.push(singleWordElement(<>&nbsp;</>, arr[i][1], i));
        thisWord += '_';
      }
      // if word[j] is not in SPACE_AND_NEWLINE_TOKENS, add it:
      if (!SPACE_AND_NEWLINE_TOKENS.includes(word[j])) {
        // result.push(singleWordElement(word[j], arr[i][1], i));
        thisWord += word[j];
      }

      if (NEWLINE_TOKENS.includes(word[j])) {
        result.push(singleWordElement('⮐', arr[i][1], i));
        result.push(
          <>
            <br />
          </>,
        );
        continue;
      }

      if (j === word.length - 1) {
        result.push(singleWordElement(thisWord, arr[i][1], i));
      }
    }
  }

  // return a react element that is a map of all the elements in the result array:
  return result.map((element, index) => <>{element}</>);
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Tokenize({ experimentInfo }) {
  const [tokenizedResult, setTokenizedResult] = useState('');
  const [numberOfTokens, setNumberOfTokens] = useState(0);
  const [numberOfCharacters, setNumberOfCharacters] = useState(0);
  const [tokenIds, setTokenIds] = useState([]);

  const { models, isError, isLoading } = chatAPI.useModelStatus();

  async function getTokens() {
    const text = document.getElementsByName('inputText')[0].value;

    const model_name = experimentInfo?.config?.foundation;

    let embeddings = await chatAPI.tokenize(model_name, text);
    const tokens = embeddings?.tokens;

    if (!tokens) {
      setTokenizedResult(
        'This inference engine plugin does not yet support a tokenization endpoint',
      );
      return;
    }

    // Create a token array that looks like [[token, tokenId], [token, tokenId], ...]
    let tokenArray = [];
    for (let i = 0; i < tokens.length; i++) {
      tokenArray.push([tokens[i], embeddings.token_ids[i]]);
    }

    setTokenizedResult(tokenArray);

    setNumberOfTokens(tokens?.length);
    setNumberOfCharacters(text?.length);

    setTokenIds(embeddings?.token_ids);
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
          paddingRight: '1rem',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* {JSON.stringify(tokenizedResult)} */}
        {/* <Typography level="title-lg">Tokenize</Typography> */}
        <Alert variant="plain" startDecorator={<LightbulbIcon />}>
          <Typography
            level="body-sm"
            textColor="text.tertiary"
            fontWeight={400}
          >
            A language model tokenizes text by breaking it up into words or
            subwords. This is useful for understanding how the model "sees" your
            input text.
          </Typography>
        </Alert>
        <div>
          <FormControl>
            <FormLabel>Input Text</FormLabel>
            <Textarea
              minRows={4}
              size="lg"
              defaultValue="How many letters are in compartmentalize?.
What is 13411321.4 + 512351.52 ?"
              name="inputText"
            />

            <FormHelperText></FormHelperText>
          </FormControl>
        </div>
        <Stack direction="row" gap={1} my={2}>
          <Button
            startDecorator={<PlayIcon />}
            onClick={async () => await getTokens()}
          >
            Process
          </Button>
          <Button
            variant="soft"
            color="danger"
            onClick={() => {
              document.getElementsByName('inputText')[0].value = '';
              setTokenizedResult('');
              setNumberOfTokens(0);
              setNumberOfCharacters(0);
              setTokenIds([]);
            }}
          >
            Clear
          </Button>
        </Stack>
        <div>
          <FormControl>
            <FormLabel>Tokens</FormLabel>
            <Sheet
              id="embeddingsResult"
              variant="soft"
              color="neutral"
              sx={{
                padding: 1,
                overflow: 'auto',
                backgroundColor: 'var(--joy-palette-background-level2)',
                color: 'black',
              }}
            >
              {makeRainbowTextFromArray(tokenizedResult)}
            </Sheet>
            <FormHelperText>
              Number of Tokens: {numberOfTokens}, Number of Characters:{' '}
              {numberOfCharacters}
            </FormHelperText>
          </FormControl>
        </div>
        <div>
          <FormControl sx={{ marginTop: 4 }}>
            <FormLabel>Token IDs</FormLabel>
            <Sheet
              variant="soft"
              color="neutral"
              sx={{ padding: 1, overflow: 'auto' }}
            >
              {JSON.stringify(tokenIds)}
            </Sheet>
          </FormControl>
        </div>
      </Sheet>
    </>
  );
}
