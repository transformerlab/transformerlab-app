/* eslint-disable jsx-a11y/anchor-is-valid */
import { useRef, useEffect, useState } from 'react';

import useSWR from 'swr';

import Sheet from '@mui/joy/Sheet';

import { Editor } from '@monaco-editor/react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const parseTmTheme = require('monaco-themes').parseTmTheme;
// import monakai from 'monaco-themes/themes/Monokai Bright.json';
import fairyflossTheme from '../Shared/fairyfloss.tmTheme.js';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { PencilIcon } from 'lucide-react';
import { Button, Typography } from '@mui/joy';

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ExperimentNotes({ experimentInfo }) {
  const editorRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch the experiment markdown
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Experiment.GetFile(experimentId(), 'readme.md'),
    fetcher
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
    if (value == '') {
      value = ' ';
    }

    // Use fetch to post the value to the server
    fetch(
      chatAPI.Endpoints.Experiment.SaveFile(experimentInfo.id, 'readme.md'),
      {
        method: 'POST',
        body: value,
      }
    ).then(() => {
      mutate(value);
      setIsEditing(false);
    });
  }

  function experimentId() {
    if (experimentInfo) {
      return experimentInfo.id;
    } else {
      return '';
    }
  }

  if (!experimentInfo || experimentInfo.id == '') {
    return '';
  }

  return (
    <>
      <Sheet>
        <Typography level="h1">Experiment Notes</Typography>
        {!isEditing && (
          <>
            <Sheet
              color="neutral"
              variant="outlined"
              sx={{
                mt: 3,
                minHeight: '300px',
                minWidth: '600px',
                p: 3,
                boxShadow:
                  'rgba(9, 30, 66, 0.25) 0px 4px 8px -2px, rgba(9, 30, 66, 0.08) 0px 0px 0px 1px',
              }}
              className="editableSheet"
            >
              {!data && 'Write experiment notes here...'}
              <Markdown
                remarkPlugins={[remarkGfm]}
                className="editableSheetContent"
              >
                {data}
              </Markdown>
              <Button
                onClick={() => {
                  setIsEditing(true);
                }}
                sx={{
                  mt: 1,
                  ml: 'auto',
                  position: 'absolute',
                  top: '30%',
                  left: '20%',
                }}
                variant="solid"
                className="hoverEditButton"
                startDecorator={<PencilIcon size="18px" />}
              >
                Edit
              </Button>
            </Sheet>
          </>
        )}

        {isEditing && (
          <>
            <Typography mt={3}>
              Use{' '}
              <a href="https://github.github.com/gfm/" target="_blank">
                GitHub Flavored Markdown
              </a>
            </Typography>
            <Sheet
              color="neutral"
              sx={{
                p: 3,
                backgroundColor: '#ddd',
              }}
            >
              <Editor
                height="600px"
                defaultLanguage="markdown"
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
            </Sheet>
            <Button
              onClick={() => {
                saveValue();
              }}
              sx={{ mt: 1, ml: 'auto' }}
            >
              Save
            </Button>
            <Button
              variant="soft"
              sx={{ ml: '10px' }}
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </>
        )}
      </Sheet>
    </>
  );
}
