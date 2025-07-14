/* eslint-disable jsx-a11y/anchor-is-valid */
import { useRef, useEffect, useState } from 'react';

import useSWR from 'swr';

import Sheet from '@mui/joy/Sheet';

import { Editor } from '@monaco-editor/react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// import monakai from 'monaco-themes/themes/Monokai Bright.json';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { PencilIcon, TypeOutline } from 'lucide-react';
import { Box, Button, Typography } from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext.js';
import fairyflossTheme from '../Shared/fairyfloss.tmTheme.js';

const { parseTmTheme } = require('monaco-themes');

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ExperimentNotes({}) {
  const editorRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const { experimentInfo } = useExperimentInfo();

  // Fetch the experiment markdown
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Experiment.GetFile(experimentId(), 'readme.md'),
    fetcher,
  );

  useEffect(() => {
    if (data) {
      if (editorRef?.current && typeof data === 'string') {
        editorRef?.current?.setValue(data);
      }
    }
  }, [data]);

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;
    if (editorRef?.current && typeof data === 'string') {
      editorRef?.current?.setValue(data);
    }
    setTheme(editor, monaco);
  }

  function saveValue() {
    let value = editorRef?.current?.getValue();

    // A blank string will cause the save to fail, so we replace it with a space
    if (value === '') {
      value = ' ';
    }

    // Use fetch to post the value to the server
    fetch(
      chatAPI.Endpoints.Experiment.SaveFile(experimentInfo.id, 'readme.md'),
      {
        method: 'POST',
        body: value,
      },
    )
      .then(() => {
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
            <Button
              onClick={() => {
                saveValue();
              }}
              color="success"
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
