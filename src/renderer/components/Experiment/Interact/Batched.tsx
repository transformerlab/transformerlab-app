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
  IconButton,
  Divider,
} from '@mui/joy';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { useEffect, useState } from 'react';
import {
  ConstructionIcon,
  FileStackIcon,
  PencilIcon,
  PlayIcon,
  PlusCircleIcon,
  Trash2Icon,
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

const batchedQueriesList = [
  {
    name: 'Happy List',
    key: 1,
    prompts: [
      'List all the things that make you happy',
      'What are some things that make you happy?',
      'What are some thingies that make you happy?',
    ],
  },
  {
    name: 'Sad List',
    key: 2,
    prompts: [
      'List all the things that make you sad',
      'What are some things that make you sad?',
      'What are some thingies that make you sad?',
    ],
  },
];

function ListOfBatchedQueries({ sendBatchOfQueries }) {
  const [newQueryModalOpen, setNewQueryModalOpen] = useState(false);
  const [savedBatchQueries, setSavedBatchQueries] = useState([]);

  function addQuery(query) {
    const newKey = Math.max(
      ...batchedQueriesList.map((query) => parseInt(query.key))
    );
    const newBatch = {
      key: newKey + 1,
      name: query?.name,
      prompts: query?.prompts,
    };
    setSavedBatchQueries([...savedBatchQueries, newBatch]);
  }

  useEffect(() => {
    setSavedBatchQueries(batchedQueriesList);
  }, []);

  return (
    <>
      <List
        aria-labelledby="decorated-list-demo"
        sx={{ height: '100%', overflow: 'auto' }}
      >
        {savedBatchQueries?.map((query) => (
          <ListItem key={query.key}>
            <ListItemDecorator sx={{ color: 'var(--joy-palette-neutral-400)' }}>
              <FileStackIcon />
            </ListItemDecorator>
            <ListItemContent>{query.name}</ListItemContent>
            <PlayIcon
              size="20px"
              onClick={() => sendBatchOfQueries(query?.prompts)}
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
      <NewBatchModal
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
      <Sheet color="success">{prompt}</Sheet>
      <Sheet color="neutral">{children}</Sheet>
    </Sheet>
  );
}

function NewBatchModal({ open, setOpen, addQuery }) {
  const [prompts, setPrompts] = useState<string[]>(['']);
  return (
    <Modal open={open} onClose={() => setOpen(false)}>
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
        <DialogTitle>Prompts</DialogTitle>
        {/* <DialogContent>Fill in the information of the project.</DialogContent> */}
        <form
          onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();

            const formData = new FormData(event.currentTarget);
            const formJson = Object.fromEntries((formData as any).entries());

            console.log(formJson);

            // convert {prompt[0]: 'sfdf', prompt[1]: 'sdf'} to ['sdf', 'sdf']
            const prompts = Object.keys(formJson)
              .filter((key) => key.startsWith('prompt'))
              .map((key) => formJson[key]);

            const newQuery = {
              name: formJson.name,
              prompts,
            };
            addQuery(newQuery);
            setPrompts(['']);
            setOpen(false);
          }}
        >
          <FormControl>
            <FormLabel>Batch Name</FormLabel>
            <Input required name="name" size="lg" />
          </FormControl>
          <Divider sx={{ my: 3 }} />
          <Stack spacing={2}>
            {prompts.map((prompt, index) => (
              <FormControl key={index}>
                <FormLabel>Prompt {index + 1}</FormLabel>
                <Box sx={{ display: 'flex', flexDirection: 'row' }}>
                  <Input
                    required
                    sx={{ width: '100%' }}
                    name={`prompt[${index}]`}
                    defaultValue={prompt}
                    onChange={(event) => {
                      setPrompts(
                        prompts.map((p, i) =>
                          i === index ? event.target.value : p
                        )
                      );
                    }}
                  />
                  {
                    // If this is the last item, show the delete button:
                    index === prompts.length - 1 && (
                      <IconButton
                        color="danger"
                        onClick={() => {
                          const newPrompts = [...prompts];
                          newPrompts.pop();
                          setPrompts(newPrompts);
                        }}
                      >
                        <Trash2Icon />
                      </IconButton>
                    )
                  }
                </Box>
              </FormControl>
            ))}
            <Button
              variant="outlined"
              color="success"
              onClick={() => {
                setPrompts([...prompts, '']);
              }}
              startDecorator={<PlusCircleIcon />}
            >
              Add Prompt
            </Button>
            <Button type="submit">Save</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
