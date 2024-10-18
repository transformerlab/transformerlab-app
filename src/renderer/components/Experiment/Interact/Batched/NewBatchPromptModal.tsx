import {
  Box,
  Button,
  CircularProgress,
  DialogTitle,
  Divider,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  List,
  ListItem,
  ListItemButton,
  Modal,
  ModalDialog,
  Select,
  Sheet,
  Stack,
  Typography,
  Option,
  ButtonGroup,
  ListItemDecorator,
  ListItemContent,
} from '@mui/joy';
import {
  CheckIcon,
  FileIcon,
  MessageSquareTextIcon,
  PencilIcon,
  PlusCircleIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import Dropzone from 'react-dropzone';
import NewChatForm from './NewChatForm';

import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import { IoCloudUploadOutline } from 'react-icons/io5';
import { Form } from 'react-router-dom';

export default function NewBatchModal({
  open,
  setOpen,
  addQuery,
  currentlyEditingQuery = null,
}) {
  const [prompts, setPrompts] = useState<string[]>(['']);
  const [typeOfBatch, setTypeOfBatch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dropzoneActive, setDropzoneActive] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (currentlyEditingQuery) {
      console.log('setting initials');
      setPrompts(currentlyEditingQuery.prompts);

      // if currentlyEditingQuery has a field called prompts and it is an array of strings, then it is a completion
      // if it is an array of objects, then it is a chat
      if (typeof currentlyEditingQuery.prompts[0] === 'string') {
        setTypeOfBatch('completion');
      } else {
        setTypeOfBatch('chat');
      }
    }
  }, [open]);

  const uploadFiles = async (formData) => {
    setUploading(true); //This is for the loading spinner
    //Create the dataset before uploading
    const response = await fetch(
      chatAPI.Endpoints.Dataset.Create('testali123')
    );
    const data = await response.json();
    if (data.status == 'error') {
      alert(data.message);
    } else {
      fetch(chatAPI.Endpoints.Dataset.FileUpload('testali123'), {
        method: 'POST',
        body: formData,
      })
        .then((response) => {
          if (response.ok) {
            return response.json();
          } else {
            throw new Error('File upload failed');
          }
        })
        .then((data) => {
          console.log('Server response:', data);
        })
        .catch((error) => {
          console.error('Error uploading file:', error);
        });
    }
    setUploading(false);
  };

  function closeWindow() {
    setOpen(false);
    setTypeOfBatch('');
    setPrompts(['']);
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        closeWindow();
      }}
    >
      <>
        {typeOfBatch === '' && (
          <ModalDialog>
            <DialogTitle>Type of Batch Prompt</DialogTitle>
            {/* {JSON.stringify(currentlyEditingQuery)} */}
            <List>
              <ListItem>
                <ListItemButton onClick={() => setTypeOfBatch('completion')}>
                  <TerminalIcon />
                  Completion
                </ListItemButton>
              </ListItem>
              <ListItem>
                <ListItemButton onClick={() => setTypeOfBatch('chat')}>
                  <MessageSquareTextIcon />
                  Chat
                </ListItemButton>
              </ListItem>
              <ListItem>
                <ListItemButton onClick={() => setTypeOfBatch('file')} disabled>
                  <FileIcon />
                  Import From File
                  <br />
                  (Not yet implemented)
                </ListItemButton>
              </ListItem>
            </List>
          </ModalDialog>
        )}
        {typeOfBatch === 'completion' && (
          <ModalDialog
            sx={{
              minWidth: '50vw',
              maxWidth: '90vw',
              maxHeight: '90vh',
              width: 'auto',
              height: 'auto',
              display: 'flex',
              overflow: 'auto',
            }}
          >
            <DialogTitle>Prompts</DialogTitle>
            {/* <DialogContent>Fill in the information of the project.</DialogContent> */}
            <form
              onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
                event.preventDefault();

                const formData = new FormData(event.currentTarget);
                const formJson = Object.fromEntries(
                  (formData as any).entries()
                );

                console.log(formJson);

                // convert {prompt[0]: 'sfdf', prompt[1]: 'sdf'} to ['sdf', 'sdf']
                const prompts = Object.keys(formJson)
                  .filter((key) => key.startsWith('prompt'))
                  .map((key) => formJson[key]);

                const newQuery = {
                  name: formJson.name,
                  prompts,
                };
                await addQuery(newQuery);
                closeWindow();
              }}
            >
              <FormControl>
                <FormLabel>Batch Name</FormLabel>
                <Input
                  required
                  name="name"
                  size="lg"
                  placeholder="e.g. Common Knowledge Prompts"
                  defaultValue={currentlyEditingQuery?.name}
                />
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
                        placeholder="e.g. The color of the sky is blue but sometimes it can also be"
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
                        index === prompts.length - 1 && prompts.length > 1 && (
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
                  color="neutral"
                  onClick={() => {
                    setPrompts([...prompts, '']);
                  }}
                  startDecorator={<PlusCircleIcon />}
                  sx={{ alignSelf: 'flex-end' }}
                >
                  Add Prompt
                </Button>
                <Button type="submit">Save Batch</Button>
              </Stack>
            </form>
          </ModalDialog>
        )}
        {typeOfBatch === 'chat' && (
          <ModalDialog sx={{}}>
            <ListOfChats
              save={(chatName, chats) => {
                // convert chats from a list of objects, to a list of strings:
                // const newChats = chats.map((chat) => JSON.stringify(chat));
                addQuery({
                  name: chatName,
                  prompts: chats,
                });
                closeWindow();
              }}
              defaultChats={currentlyEditingQuery?.prompts}
              defaultName={currentlyEditingQuery?.name}
            />
          </ModalDialog>
        )}
        {typeOfBatch === 'file' && (
          <ModalDialog sx={{}}>
            <DialogTitle>File</DialogTitle>
            <Divider sx={{ my: 2 }} />
            <Box //Making the modal a set size
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                overflowY: 'hidden',
                width: '25vw',
                justifyContent: 'center',
              }}
            >
              <Dropzone
                onDrop={async (acceptedFiles) => {
                  setDropzoneActive(false);

                  const formData = new FormData();
                  for (const file of acceptedFiles) {
                    formData.append('files', file);
                  }
                  await uploadFiles(formData);
                }}
                onDragEnter={() => {
                  setDropzoneActive(true);
                }}
                onDragLeave={() => {
                  setDropzoneActive(false);
                }}
                noClick
              >
                {({ getRootProps, getInputProps }) => (
                  <div id="dropzone_baby" {...getRootProps()}>
                    <Sheet
                      color="primary"
                      variant="soft"
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        marginBottom: '0rem',
                        overflow: 'hidden',
                        minHeight: '130px',
                        border: dropzoneActive
                          ? '2px solid var(--joy-palette-warning-400)'
                          : '2px dashed var(--joy-palette-neutral-300)',
                        borderRadius: '8px',
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        color: 'var(--joy-palette-neutral-400)',
                      }}
                    >
                      <IoCloudUploadOutline size="36px" /> Drag files here
                      <Typography level="body-xs" color="neutral" mt={3}>
                        Allowed filetypes: .jsonl, .json
                      </Typography>
                    </Sheet>
                  </div>
                )}
              </Dropzone>
              <Button
                startDecorator={<PlusCircleIcon />}
                onClick={() => {
                  var input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true; //Allow multiple files

                  // input.accept = '.jsonl'; //Only allow JSONL files
                  input.onchange = async (e) => {
                    let files = Array.from(input.files);
                    console.log(files);
                    const formData = new FormData();
                    for (const file of files) {
                      formData.append('files', file);
                    }
                    await uploadFiles(formData);
                  };
                  input.click();
                }}
                disabled={uploading}
              >
                {uploading ? <CircularProgress /> : 'Add files'}
              </Button>
            </Box>
          </ModalDialog>
        )}
      </>
    </Modal>
  );
}

function ListOfChats({ save, defaultChats = [], defaultName = '' }) {
  const [chats, setChats] = useState([]);
  // set editChat to -1 if you want to create a new chat, set it a specific index in the chats
  // array if you want to edit that chat. Set it to null if you are not editing
  const [editChat, setEditChat] = useState<number | null>(null);
  const [chatName, setChatName] = useState('');

  useEffect(() => {
    setChats(defaultChats);
    setChatName(defaultName);
  }, []);

  return (
    <>
      <DialogTitle>
        {editChat !== null
          ? 'New Chat'
          : 'Create Batch of Chat Formatted Prompts'}
      </DialogTitle>
      <Divider sx={{ my: 1 }} />
      {editChat !== null ? (
        <NewChatForm
          defaultChats={editChat === -1 ? [] : chats[editChat]}
          submitChat={(chat) => {
            // If editChat is -1, then we are creating a new chat
            if (editChat === -1) {
              setChats([...chats, chat]);
            } else {
              const newChats = [...chats];
              newChats[editChat] = chat;
              setChats(newChats);
            }
            setEditChat(null);
          }}
        />
      ) : (
        <>
          <form
            onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              save(chatName, chats);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <FormControl>
              <FormLabel>Chat Name</FormLabel>
              <Input
                required
                value={chatName}
                onChange={(event) => setChatName(event.target.value)}
                size="lg"
                placeholder="e.g. Common Knowledge Prompts"
              />
            </FormControl>
            <FormControl sx={{ mt: 3 }}>
              <FormLabel>Chats:</FormLabel>
              {chats.length === 0 && (
                <Typography level="body-md" color="neutral">
                  List of chats is empty
                </Typography>
              )}
              <List>
                {chats.map((chat, index) => (
                  <ListItem key={index}>
                    <ListItemDecorator>
                      <MessageSquareTextIcon />
                    </ListItemDecorator>
                    <ListItemContent sx={{ overflow: 'clip' }}>
                      {JSON.stringify(chat)}
                    </ListItemContent>
                    <ButtonGroup>
                      <Button
                        variant="plain"
                        onClick={() => {
                          setEditChat(index);
                        }}
                      >
                        <PencilIcon size="18px" />
                      </Button>
                      <Button
                        variant="plain"
                        onClick={() => {
                          const newChats = [...chats];
                          newChats.splice(index, 1);
                          setChats(newChats);
                        }}
                      >
                        <Trash2Icon size="18px" />
                      </Button>
                    </ButtonGroup>
                  </ListItem>
                ))}
              </List>
            </FormControl>

            <Button
              variant="soft"
              onClick={() => setEditChat(-1)}
              sx={{ alignSelf: 'flex-end' }}
            >
              Add New Chat
            </Button>
            {/* <Button onClick={() => setChats([])}>Clear</Button> */}
            <Divider sx={{ my: 2 }} />
            <Button type="submit">Save Batch</Button>
          </form>
        </>
      )}
    </>
  );
}
