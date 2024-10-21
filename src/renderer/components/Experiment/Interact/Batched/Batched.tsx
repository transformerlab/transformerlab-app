import {
  FormControl,
  Sheet,
  Box,
  Typography,
  List,
  ListItem,
  ListItemDecorator,
  ListItemButton,
  Alert,
  ListDivider,
  ListItemContent,
  LinearProgress,
  IconButton,
  ButtonGroup,
  Button,
  FormLabel,
  Slider,
} from '@mui/joy';
import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import { useState } from 'react';
import {
  ConstructionIcon,
  DownloadIcon,
  FileStackIcon,
  MessagesSquare,
  PencilIcon,
  PlayIcon,
  PlusCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import MainGenerationConfigKnobs from '../MainGenerationConfigKnobs';
import NewBatchPromptModal from './NewBatchPromptModal';
import useSWR from 'swr';
import ThinSlider from '../ThinSlider';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Batched({
  tokenCount,
  defaultPromptConfigForModel = {},
  generationParameters,
  setGenerationParameters,
  sendCompletionToLLM,
  experimentInfo,
}) {
  const [isThinking, setIsThinking] = useState(false);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [result, setResult] = useState({});
  const [repeatTimes, setRepeatTimes] = useState(1);
  async function sendBatchOfQueries(prompts) {
    const text = prompts;
    let typeOfCompletion = 'chat';

    // if prompts is a list of strings, this is a completion type
    if (typeof prompts[0] === 'string') {
      typeOfCompletion = 'completion';
    }

    const currentModel = experimentInfo?.config?.foundation;
    const adaptor = experimentInfo?.config?.adaptor;

    setIsThinking(true);

    var inferenceParams = '';

    if (experimentInfo?.config?.inferenceParams) {
      inferenceParams = experimentInfo?.config?.inferenceParams;
      inferenceParams = JSON.parse(inferenceParams);
    }

    const generationParamsJSON = experimentInfo?.config?.generationParams;
    const generationParameters = JSON.parse(generationParamsJSON);

    try {
      generationParameters.stop_str = JSON.parse(
        generationParameters?.stop_str
      );
    } catch (e) {
      console.log('Error parsing stop strings as JSON');
    }

    const targetElement = document.getElementById('completion-textarea');

    let result: string | null = '';

    if (typeOfCompletion == 'completion') {
      result = await chatAPI.sendBatchedCompletion(
        currentModel,
        adaptor,
        text,
        generationParameters?.temperature,
        generationParameters?.maxTokens,
        generationParameters?.topP,
        false,
        generationParameters?.stop_str,
        repeatTimes
      );
    } else {
      result = [];
      for (let i = 0; i < repeatTimes; i++) {
        const r = await chatAPI.sendBatchedChat(
          currentModel,
          adaptor,
          text,
          generationParameters?.temperature,
          generationParameters?.maxTokens,
          generationParameters?.topP,
          false,
          generationParameters?.stop_str
        );
        // r is an array, add the elements of r to the result array
        result = [...result, ...r];
      }
    }

    setIsThinking(false);

    console.log('result', result);
    setPrompts(text);
    setResult(result);
    return result?.text;
  }

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        gap: 2,
      }}
      id="chat-surrounding"
    >
      <Box
        id="right-hand-panel-of-chat-page"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          flex: '0 0 350px',
          xjustifyContent: 'space-between',
          overflow: 'hidden',
          height: '100%',
          xborder: '1px solid #ccc',
          padding: 1,
        }}
      >
        <FormControl>
          <MainGenerationConfigKnobs
            generationParameters={generationParameters}
            setGenerationParameters={setGenerationParameters}
            tokenCount={tokenCount}
            defaultPromptConfigForModel={defaultPromptConfigForModel}
            showAllKnobs={false}
          />
        </FormControl>
        {/* <Box sx={{ flex: 1, minWidth: '200px' }}>
          <ThinSlider
            title="Repeat n times"
            value={repeatTimes}
            onChange={(e, newValue) => {
              setRepeatTimes(newValue as number);
            }}
            max={6}
            min={1}
            valueLabelDisplay="auto"
          />
        </Box> */}
        <Typography
          level="body-xs"
          sx={{ textTransform: 'uppercase', fontWeight: 'lg', mb: 1 }}
        >
          Saved Batches
        </Typography>
        <Box
          sx={{
            display: 'flex',
            border: '1px solid #ccc',
            padding: 1,
            flexDirection: 'column',
            height: '100%',
            overflow: 'auto',
          }}
        >
          <ListOfBatchedQueries sendBatchOfQueries={sendBatchOfQueries} />
        </Box>
      </Box>
      <Sheet
        id="chat-window"
        sx={{
          borderRadius: 'md',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          flex: 'auto',
          overflow: 'hidden',
          height: '100%',
        }}
      >
        <Sheet
          variant="plain"
          sx={{
            width: '100%',
            // borderRadius: "md",
            overflow: 'hidden',
            padding: 1,
            flexDirection: 'column',
            height: '100%',
            display: 'flex',
            gap: 1,
          }}
        >
          <Button
            sx={{ alignSelf: 'flex-end' }}
            variant="outlined"
            startDecorator={<DownloadIcon />}
            disabled={!result?.choices && !result?.[0]?.choices}
            onClick={() => {
              //add download link that returns value of result.
              const element = document.createElement('a');
              const file = new Blob([JSON.stringify(result)], {
                type: 'text/plain',
              });
              element.href = URL.createObjectURL(file);
              element.download = 'result.json';
              document.body.appendChild(element); // Required for this to work in FireFox
              element.click();
            }}
          >
            Download Result
          </Button>
          {isThinking && <LinearProgress />}
          {/* {JSON.stringify(result, null, 2)} */}
          {result == null && (
            <Alert color="danger">
              There was an error getting a response from the server.
            </Alert>
          )}

          <Sheet
            sx={{
              height: '100%',
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {/* <pre>{JSON.stringify(result, null, 2)}</pre> */}
            {result?.choices?.map((choice, index) => (
              <CompletionResult prompt={prompts?.[index]} key={index}>
                {choice?.text}
              </CompletionResult>
            ))}

            {result?.[0]?.choices != null &&
              result?.map((r, index) => (
                <ChatResult
                  prompts={prompts[index]}
                  key={index}
                  response={r?.choices?.[0]?.message}
                />
              ))}
          </Sheet>
        </Sheet>
      </Sheet>
    </Sheet>
  );
}

function ListOfBatchedQueries({ sendBatchOfQueries }) {
  const [newQueryModalOpen, setNewQueryModalOpen] = useState(false);
  const [currentlyEditingQuery, setCurrentlyEditingQuery] = useState(null);

  const { data: batchedPrompts, mutate: mutateBatchedPrompts } = useSWR(
    chatAPI.Endpoints.BatchedPrompts.List(),
    fetcher
  );

  async function addQuery(query) {
    await fetch(chatAPI.Endpoints.BatchedPrompts.New(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query),
    });
    mutateBatchedPrompts();
  }

  return (
    <>
      <List
        aria-labelledby="decorated-list-demo"
        sx={{ height: '100%', overflow: 'auto' }}
      >
        {batchedPrompts?.length > 0 &&
          batchedPrompts?.map((query) => (
            <ListItem key={query.name}>
              <ListItemDecorator
                sx={{ color: 'var(--joy-palette-neutral-400)' }}
              >
                {
                  // If first element in query?.prompts is a string, then it is a completion query:
                  // Display the completion icon
                  typeof query?.prompts[0] === 'string' ? (
                    <FileStackIcon />
                  ) : (
                    <MessagesSquare />
                  )
                }
              </ListItemDecorator>
              <ListItemContent sx={{ textWrap: 'balance', overflow: 'clip' }}>
                <Typography level="title-md"> {query.name}</Typography>
                <Typography level="body-sm">
                  {query.prompts?.length} prompt
                  {query.prompts?.length == 1 ? '' : 's'}
                </Typography>
              </ListItemContent>
              <ButtonGroup>
                <IconButton onClick={() => sendBatchOfQueries(query?.prompts)}>
                  <PlayIcon size="20px" />
                </IconButton>{' '}
                <IconButton
                  onClick={() => {
                    setCurrentlyEditingQuery(query);
                    setNewQueryModalOpen(true);
                  }}
                >
                  <PencilIcon size="20px" />{' '}
                </IconButton>
                <IconButton
                  onClick={async () => {
                    await fetch(
                      chatAPI.Endpoints.BatchedPrompts.Delete(query.name)
                    );
                    mutateBatchedPrompts();
                  }}
                >
                  <Trash2Icon size="20px" />{' '}
                </IconButton>
              </ButtonGroup>
            </ListItem>
          ))}
        <ListDivider />

        <ListItem>
          <ListItemButton
            onClick={() => {
              setCurrentlyEditingQuery(null);
              setNewQueryModalOpen(true);
            }}
          >
            <ListItemDecorator>
              <PlusCircleIcon />
            </ListItemDecorator>
            New
          </ListItemButton>
        </ListItem>
      </List>
      <NewBatchPromptModal
        open={newQueryModalOpen}
        setOpen={setNewQueryModalOpen}
        addQuery={addQuery}
        currentlyEditingQuery={currentlyEditingQuery}
      />
    </>
  );
}

function CompletionResult({ prompt, children }) {
  return (
    <Sheet variant="outlined" sx={{ padding: 2 }}>
      <span
        style={{
          color: 'var(--joy-palette-success-700)',
          backgroundColor: 'var(--joy-palette-success-100)',
        }}
      >
        {prompt}
      </span>
      <span color="neutral">{children}</span>
    </Sheet>
  );
}

function ChatResult({ prompts, response }) {
  return (
    <Sheet variant="outlined" sx={{ padding: 2 }}>
      {/* {JSON.stringify(prompts)} */}
      {/* go through each prompt and display {role, content} */}
      {prompts?.map((prompt, index) => (
        <div
          key={index}
          style={{
            color: 'var(--joy-palette-neutral-700)',
            backgroundColor: 'var(--joy-palette-neutral-100)',
          }}
        >
          <b>{prompt?.role}:</b> {prompt?.content}
        </div>
      ))}
      <span color="neutral">
        <b>{response?.role}:</b> {response?.content}
      </span>
    </Sheet>
  );
}
