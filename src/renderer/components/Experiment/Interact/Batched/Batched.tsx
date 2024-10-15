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
} from '@mui/joy';
import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import { useState } from 'react';
import {
  ConstructionIcon,
  FileStackIcon,
  PencilIcon,
  PlayIcon,
  PlusCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import MainGenerationConfigKnobs from '../MainGenerationConfigKnobs';
import NewBatchPromptModal from './NewBatchPromptModal';
import useSWR from 'swr';

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
  async function sendBatchOfQueries(prompts) {
    const text = prompts;

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

    const result = await chatAPI.sendBatchedCompletion(
      currentModel,
      adaptor,
      text,
      generationParameters?.temperature,
      generationParameters?.maxTokens,
      generationParameters?.topP,
      false,
      generationParameters?.stop_str
    );

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
          flex: '0 0 300px',
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
        <Typography
          level="body-xs"
          sx={{ textTransform: 'uppercase', fontWeight: 'lg', mb: 1 }}
        >
          Batched Queries
        </Typography>
        <Box
          sx={{
            display: 'flex',
            border: '1px solid #ccc',
            padding: 1,
            flexDirection: 'column',
            height: '100%',
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
        <Alert
          variant="outlined"
          color="warning"
          startDecorator={<ConstructionIcon />}
        >
          Work In Progress. This is a placeholder for batched queries -- we will
          be expanding this portion of the app in an upcoming release. This
          feature will allow a user to save a list of predefined queries and
          then run them in batch.
        </Alert>
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
          {isThinking && <LinearProgress />}
          <Sheet sx={{ height: '100%', overflow: 'auto' }}>
            {result?.choices?.map((choice, index) => (
              <Result prompt={prompts?.[index]} key={index}>
                {choice?.text}
              </Result>
            ))}
          </Sheet>
        </Sheet>
      </Sheet>
    </Sheet>
  );
}

function ListOfBatchedQueries({ sendBatchOfQueries }) {
  const [newQueryModalOpen, setNewQueryModalOpen] = useState(false);

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
                <FileStackIcon />
              </ListItemDecorator>
              <ListItemContent sx={{ textWrap: 'balance', overflow: 'clip' }}>
                {query.name}
              </ListItemContent>
              <ButtonGroup>
                <IconButton onClick={() => sendBatchOfQueries(query?.prompts)}>
                  <PlayIcon size="20px" />
                </IconButton>{' '}
                <IconButton onClick={() => alert('not implemented')}>
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
              setNewQueryModalOpen(true);
            }}
          >
            <ListItemDecorator sx={{ color: 'var(--joy-palette-success-400)' }}>
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
      />
    </>
  );
}

function Result({ prompt, children }) {
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
