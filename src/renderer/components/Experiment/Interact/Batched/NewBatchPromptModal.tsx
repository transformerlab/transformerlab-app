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
  Sheet,
  Stack,
  Typography,
} from '@mui/joy';
import {
  FileIcon,
  MessageSquareTextIcon,
  PlusCircleIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import Dropzone from 'react-dropzone';

import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import { IoCloudUploadOutline } from 'react-icons/io5';

export default function NewBatchModal({ open, setOpen, addQuery }) {
  const [prompts, setPrompts] = useState<string[]>(['']);
  const [typeOfBatch, setTypeOfBatch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dropzoneActive, setDropzoneActive] = useState(false);

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

  return (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false);
        setTypeOfBatch('');
      }}
    >
      <>
        {typeOfBatch === '' && (
          <ModalDialog>
            <DialogTitle>Type of Batch Prompt</DialogTitle>
            <List>
              <ListItem>
                <ListItemButton onClick={() => setTypeOfBatch('file')} disabled>
                  <FileIcon />
                  Import From File (not yet implemented)
                </ListItemButton>
              </ListItem>
              <ListItem>
                <ListItemButton onClick={() => setTypeOfBatch('completion')}>
                  <TerminalIcon />
                  Completion Style
                </ListItemButton>
              </ListItem>
              <ListItem>
                <ListItemButton onClick={() => setTypeOfBatch('chat')} disabled>
                  <MessageSquareTextIcon />
                  Chat Completion (not yet implemented)
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
                setPrompts(['']);
                setOpen(false);
              }}
            >
              <FormControl>
                <FormLabel>Batch Name</FormLabel>
                <Input
                  required
                  name="name"
                  size="lg"
                  placeholder="e.g. Common Knowledge Prompts"
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
        )}
        {typeOfBatch === 'chat' && (
          <ModalDialog sx={{}}>
            <DialogTitle>Chat</DialogTitle>
            Not Implemented
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
