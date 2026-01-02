/* eslint-disable jsx-a11y/anchor-is-valid */
import { useRef, useEffect, useState } from 'react';

import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

import Sheet from '@mui/joy/Sheet';

import { Editor } from '@monaco-editor/react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// import monakai from 'monaco-themes/themes/Monokai Bright.json';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { authenticatedFetch } from 'renderer/lib/api-client/functions';
import { PencilIcon, TypeOutline } from 'lucide-react';
import {
  Box,
  Button,
  Typography,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
} from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext.js';
import fairyflossTheme from '../Shared/fairyfloss.tmTheme.js';

const { parseTmTheme } = require('monaco-themes');

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

export default function ExperimentNotes({}) {
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const editorRef = useRef<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { experimentInfo } = useExperimentInfo();

  // Fetch the experiment markdown
  const { data, mutate } = useSWR(
    chatAPI.Endpoints.Experiment.GetFile(experimentId(), 'readme.md'),
    fetcher,
  );

  useEffect(() => {
    if (data) {
      if (editorRef?.current && typeof data === 'string') {
        editorRef?.current?.setValue(data);
        setCharCount(data.length);
      }
    }
  }, [data]);

  function handleEditorDidMount(editor: any, monaco: any) {
    editorRef.current = editor;
    if (editorRef?.current && typeof data === 'string') {
      editorRef?.current?.setValue(data);
      setCharCount(data.length);
    }
    setTheme(editor, monaco);
  }

  function saveValue() {
    let value = editorRef?.current?.getValue();

    // Limit check
    if (value && value.length > 50000) {
      setShowLimitModal(true);
      return;
    }

    // A blank string will cause the save to fail, so we replace it with a space
    if (value === '') {
      value = ' ';
    }

    // Use authenticatedFetch to post the value to the server with proper authentication
    // Note: Backend expects JSON body, so we send the string as JSON
    authenticatedFetch(
      chatAPI.Endpoints.Experiment.SaveFile(experimentInfo.id, 'readme.md'),
      {
        method: 'POST',
        body: JSON.stringify(value),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        mutate();
        setIsEditing(false);
        return true;
      })
      .catch((error) => {
        console.error('Error saving the file:', error);
      });
  }

  function experimentId() {
    if (experimentInfo) {
      return experimentInfo.id;
    }
    return '';
  }

  if (!experimentInfo || !experimentInfo.id) {
    return '';
  }

  return (
    <Sheet
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        mb: 3,
      }}
    >
      <Modal open={showLimitModal} onClose={() => setShowLimitModal(false)}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Character Limit Exceeded</DialogTitle>
          <DialogContent>
            Your notes exceed the 50,000 character limit. Please shorten them
            before saving.
          </DialogContent>
        </ModalDialog>
      </Modal>

      <Typography level="h3">Experiment Notes</Typography>
      {!isEditing && (
        <Sheet
          color="neutral"
          variant="soft"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            mt: 1,
            height: '100%',
            px: 3,
            overflow: 'auto',
          }}
          className="editableSheet"
        >
          {!data && (
            <Typography mt={3}>Write experiment notes here...</Typography>
          )}
          <Box display="flex" sx={{ width: '100%' }}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              className="editableSheetContent"
            >
              {data}
            </Markdown>
          </Box>
        </Sheet>
      )}
      {isEditing && (
        <Sheet
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Typography mt={3}>
            Use{' '}
            <a
              href="https://github.github.com/gfm/"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Flavored Markdown
            </a>
          </Typography>
          <Sheet
            color="neutral"
            sx={{
              p: 3,
              display: 'flex',
              backgroundColor: '#ddd',
              height: '100%',
            }}
          >
            <Editor
              defaultLanguage="markdown"
              theme="my-theme"
              height="100%"
              options={{
                minimap: {
                  enabled: false,
                },
                fontSize: 18,
                cursorStyle: 'block',
                wordWrap: 'on',
              }}
              onMount={handleEditorDidMount}
              onChange={(value) => {
                setCharCount(value?.length || 0);
              }}
            />
          </Sheet>
        </Sheet>
      )}
      <Box
        display="flex"
        flexDirection="row"
        gap={1}
        sx={{
          width: '100%',
          justifyContent: 'flex-end',
          alignContent: 'center',
          mt: 1,
        }}
      >
        {isEditing ? (
          <>
            <Typography
              level="body-sm"
              sx={{
                alignSelf: 'center',
                mr: 2,
                color:
                  charCount > 50000
                    ? 'danger.plainColor'
                    : 'neutral.plainColor',
              }}
            >
              {charCount} / 50000
            </Typography>
            <Button
              onClick={() => {
                saveValue();
              }}
              color="success"
              disabled={charCount > 50000}
            >
              Save
            </Button>
            <Button
              variant="plain"
              color="danger"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            onClick={() => {
              setIsEditing(true);
            }}
            color="primary"
            variant="solid"
            startDecorator={<PencilIcon size="18px" />}
          >
            Edit
          </Button>
        )}
      </Box>
    </Sheet>
  );
}
