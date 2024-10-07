import {
  Button,
  FormControl,
  FormLabel,
  Sheet,
  Stack,
  Textarea,
  Box,
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  Input,
  Typography,
  List,
  ListItem,
  ListItemDecorator,
  ListItemButton,
  Alert,
  ListDivider,
  ListItemContent,
  LinearProgress,
} from '@mui/joy';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { useState } from 'react';
import {
  ConstructionIcon,
  FileStackIcon,
  PencilIcon,
  PlayIcon,
  PlusCircleIcon,
} from 'lucide-react';
import MainGenerationConfigKnobs from './MainGenerationConfigKnobs';

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
  async function sendBatchOfQueries(key) {
    const text = batchedQueriesList.find((query) => query.key === key).prompts;

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
        </FormControl>{' '}
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
              <Result prompt={prompts?.[index]}>{choice?.text}</Result>
            ))}
          </Sheet>
        </Sheet>
      </Sheet>
    </Sheet>
  );
}

const batchedQueriesList = [
  {
    name: 'Happy List',
    key: '1',
    prompts: [
      'List all the things that make you happy',
      'What are some things that make you happy?',
      'What are some thingies that make you happy?',
    ],
  },
  {
    name: 'Sad List',
    key: '2',
    prompts: [
      'List all the things that make you sad',
      'What are some things that make you sad?',
      'What are some thingies that make you sad?',
    ],
  },
  {
    name: 'Angry List',
    key: '3',
    prompts: [
      'List all the things that make you angry',
      'What are some things that make you angry?',
      'What are some thingies that make you angry?',
    ],
  },
  {
    name: 'Surprised List',
    key: '4',
    prompts: [
      'List all the things that make you surprised',
      'What are some things that make you surprised?',
      'What are some thingies that make you surprised?',
    ],
  },
  {
    name: 'Excited List',
    key: '5',
    prompts: [
      'List all the things that make you excited',
      'What are some things that make you excited?',
      'What are some thingies that make you excited?',
    ],
  },
  {
    name: 'Bored List',
    key: '6',
    prompts: [
      'List all the things that make you bored',
      'What are some things that make you bored?',
      'What are some thingies that make you bored?',
    ],
  },
  {
    name: 'Confused List',
    key: '7',
    prompts: [
      'List all the things that make you confused',
      'What are some things that make you confused?',
      'What are some thingies that make you confused?',
    ],
  },
];

function ListOfBatchedQueries({ sendBatchOfQueries }) {
  const [newQueryModalOpen, setNewQueryModalOpen] = useState(false);

  return (
    <>
      <List
        aria-labelledby="decorated-list-demo"
        sx={{ height: '100%', overflow: 'auto' }}
      >
        {batchedQueriesList.map((query) => (
          <ListItem key={query.key}>
            <ListItemDecorator sx={{ color: 'var(--joy-palette-neutral-400)' }}>
              <FileStackIcon />
            </ListItemDecorator>
            <ListItemContent>{query.name}</ListItemContent>
            <PlayIcon
              size="20px"
              onClick={() => sendBatchOfQueries(query.key)}
            />
            <PencilIcon size="20px" />
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
      <Modal
        open={newQueryModalOpen}
        onClose={() => setNewQueryModalOpen(false)}
      >
        <ModalDialog
          sx={{
            minWidth: '50vw',

            maxWidth: '90vw',
            maxHeight: '90vh',
            width: 'auto',
            height: 'auto',
            display: 'flex',
          }}
        >
          <DialogTitle>Create new project</DialogTitle>
          <DialogContent>Fill in the information of the project.</DialogContent>
          <form
            onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();

              const formData = new FormData(event.currentTarget);
              const formJson = Object.fromEntries((formData as any).entries());

              console.log(formJson);

              setNewQueryModalOpen(false);
            }}
          >
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>System Prompt</FormLabel>
                <Input autoFocus required name="system" />
              </FormControl>
              <FormControl>
                <FormLabel>Prompt</FormLabel>
                <Input required name="prompt" />
              </FormControl>
              <Button type="submit">Submit</Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </>
  );
}

export function Result({ prompt, children }) {
  return (
    <Sheet variant="outlined" sx={{ padding: 2 }}>
      <Sheet color="success">{prompt}</Sheet>
      <Sheet color="neutral">{children}</Sheet>
    </Sheet>
  );
}
