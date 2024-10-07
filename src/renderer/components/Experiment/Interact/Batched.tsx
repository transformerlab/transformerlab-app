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
} from '@mui/joy';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';
import useSWR from 'swr';
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
  chats,
  setChats,
  experimentInfo,
  isThinking,
  sendNewMessageToLLM,
  stopStreaming,
  experimentInfoMutate,
  tokenCount,
  text,
  debouncedText,
  defaultPromptConfigForModel = {},
  enableTools = false,
  currentModelArchitecture,
  generationParameters,
  setGenerationParameters,
  conversations,
  conversationsIsLoading,
  conversationsMutate,
  setConversationId,
  conversationId,
}) {
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
          id="decorated-list-demo"
          level="body-xs"
          sx={{ textTransform: 'uppercase', fontWeight: 'lg', mb: 1 }}
        >
          Batched Queries
        </Typography>
        <Box
          sx={{
            display: 'flex',
            border: '1px solid #ccc',
            padding: 2,
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <ListOfBatchedQueries />
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
          <FormControl>
            <FormLabel>Result:</FormLabel>
            <Textarea minRows={20} />
          </FormControl>
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

function ListOfBatchedQueries({}) {
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
            <PlayIcon size="20px" onClick={() => alert('hi')} />
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
