/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import {
  Box,
  Breadcrumbs,
  Button,
  ButtonGroup,
  DialogContent,
  DialogTitle,
  FormControl,
  FormLabel,
  Input,
  LinearProgress,
  Modal,
  ModalDialog,
  Stack,
  Tab,
  TabList,
  Tabs,
  Typography,
} from '@mui/joy';

import {
  PlayCircle,
  PlayCircleIcon,
  PlusCircleIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Editor } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

const parseTmTheme = require('monaco-themes').parseTmTheme;
import fairyflossTheme from '../Shared/fairyfloss.tmTheme.js';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';

function ListPluginFiles({
  files,
  currentFile,
  setCurrentFile,
  setNewFileModalOpen,
}) {
  if (files == null) {
    return <LinearProgress />;
  }
  return (
    <Tabs
      aria-label="Files"
      value={currentFile}
      sx={{ maxWidth: '100%', mt: 3 }}
      onChange={(e, v) => {
        setCurrentFile(v);
      }}
    >
      <TabList
        sx={{
          overflow: 'auto',
          scrollSnapType: 'x mandatory',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {files.map((file, index) => (
          <Tab
            key={index}
            value={file}
            sx={{ flex: 'none', scrollSnapAlign: 'start' }}
          >
            {file}
          </Tab>
        ))}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px 0 8px',
          }}
        >
          <PlusCircleIcon
            size="1.2em"
            onClick={() => {
              setNewFileModalOpen(true);
            }}
          />
        </div>
      </TabList>
    </Tabs>
  );
}

function NewFileNameModal({
  open,
  setOpen,
  experimentInfo,
  pluginName,
  filesMutate,
}) {
  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog>
        {/* <DialogTitle>New File Name</DialogTitle> */}
        {/* <DialogContent></DialogContent> */}
        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const newfile = formData.get('filename');
            const response = await fetch(
              chatAPI.Endpoints.Experiment.ScriptNewFile(
                experimentInfo?.id,
                pluginName,
                newfile
              )
            );
            const result = await response.json();
            if (result?.error) {
              alert(result?.message);
            }
            filesMutate();
            setOpen(false);
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>New Filename</FormLabel>
              <Input name="filename" autoFocus required />
            </FormControl>
            <Button type="submit">Submit</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PluginDetails({ experimentInfo }) {
  let { pluginName } = useParams();
  let { state: plugin } = useLocation();

  const [currentFile, setCurrentFile] = useState(null);
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);

  // Fetch the file contents
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Experiment.ScriptGetFile(
      experimentInfo?.id,
      pluginName,
      currentFile
    ),
    fetcher
  );

  const {
    data: files,
    error: filesError,
    isLoading: filesIsLoading,
    mutate: filesMutate,
  } = useSWR(
    chatAPI.Endpoints.Experiment.ScriptListFiles(
      experimentInfo?.id,
      pluginName
    ),
    fetcher
  );

  const editorRef = useRef(null);

  useEffect(() => {
    if (data !== null) {
      if (editorRef?.current && typeof data === 'string') {
        editorRef?.current?.setValue(data);
      }
      editorRef?.current?.updateOptions({
        readOnly: false,
      });
      editorRef?.current?.layout();
    }
  }, [data]);

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;
    if (editorRef?.current && typeof data === 'string') {
      editorRef?.current?.setValue(data);
      editorRef?.current?.updateOptions({
        readOnly: false,
      });
    } else {
      editorRef?.current?.setValue('Select a file...');
      editorRef?.current?.updateOptions({
        readOnly: true,
      });
    }
    setTheme(editor, monaco);
  }

  useEffect(() => {
    if (files) {
      setCurrentFile(files[0]);
    }
  }, [files]);

  if (!experimentInfo?.id) {
    return 'No experiment selected.';
  }

  return (
    <Sheet
      sx={{
        height: '100%',
        pb: 2,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirecton: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <Typography level="h2" mt={1}>
          Plugin Editor
        </Typography>
        <Link to="/plugins">
          <Button variant="outlined" endDecorator={<XIcon />}>
            Close
          </Button>
        </Link>
      </Box>
      <NewFileNameModal
        open={newFileModalOpen}
        setOpen={setNewFileModalOpen}
        experimentInfo={experimentInfo}
        pluginName={pluginName}
        filesMutate={filesMutate}
      />
      <ListPluginFiles
        files={files}
        currentFile={currentFile}
        setCurrentFile={setCurrentFile}
        setNewFileModalOpen={setNewFileModalOpen}
      />
      <Sheet variant="soft" sx={{ my: 0, flex: 'auto', height: '200px' }}>
        <div
          style={{
            visibility: currentFile == null ? 'hidden' : 'visible',
            height: '100%',
          }}
        >
          <Editor
            defaultLanguage="python"
            theme="my-theme"
            options={{
              minimap: {
                enabled: false,
              },
              fontSize: 18,
              cursorStyle: 'block',
              wordWrap: 'on',
            }}
            onMount={handleEditorDidMount}
          />
        </div>
      </Sheet>
      <ButtonGroup style={{ justifyContent: 'flex-end' }}>
        <Button
          onClick={async () => {
            if (
              confirm('Are you sure you want to delete this file?') === true
            ) {
              const res = await fetch(
                chatAPI.Endpoints.Experiment.ScriptDeleteFile(
                  experimentInfo?.id,
                  pluginName,
                  currentFile
                )
              );
              const result = await res.json();
              if (result?.error) {
                alert(result?.message);
              }
              filesMutate();
            }
          }}
          startDecorator={<Trash2Icon />}
        >
          Delete
        </Button>
        <Button
          startDecorator={<PlayCircleIcon />}
          onClick={() => {
            alert('Not yet implemented.');
          }}
        >
          Run
        </Button>
        <Button
          disabled={currentFile == null ? true : false}
          onClick={() => {
            fetch(
              chatAPI.Endpoints.Experiment.ScriptSaveFile(
                experimentInfo?.id,
                pluginName,
                currentFile
              ),
              {
                method: 'POST',
                body: editorRef?.current?.getValue(),
              }
            ).then(() => {
              mutate();
            });
          }}
          startDecorator={<SaveIcon />}
        >
          Save
        </Button>
      </ButtonGroup>
    </Sheet>
  );
}
