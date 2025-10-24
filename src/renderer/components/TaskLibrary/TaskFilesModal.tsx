import React, { useEffect, useRef } from 'react';
import {
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
  Stack,
  Box,
  Chip,
  LinearProgress,
  Sheet,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
} from '@mui/joy';
import { FileIcon, FolderIcon } from 'lucide-react';
import { Editor } from '@monaco-editor/react';

import fairyflossTheme from '../Shared/fairyfloss.tmTheme.js';

const { parseTmTheme } = require('monaco-themes');

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

interface TaskFilesModalProps {
  open: boolean;
  onClose: () => void;
  taskName: string;
  files: string[];
  isLoading: boolean;
  fileCount: number;
}

export default function TaskFilesModal({
  open,
  onClose,
  taskName,
  files,
  isLoading,
  fileCount,
}: TaskFilesModalProps) {
  const editorRef = useRef(null);

  // useEffect(() => {
  //   if (data) {
  //     if (editorRef?.current && typeof data === 'string') {
  //       editorRef?.current?.setValue(data);
  //     }
  //   }
  // }, [data]);

  // function handleEditorDidMount(editor, monaco) {
  //   editorRef.current = editor;
  //   if (editorRef?.current && typeof data === 'string') {
  //     editorRef?.current?.setValue(data);
  //   }
  //   setTheme(editor, monaco);
  // }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: '80vw',
          height: '80vh',
          overflow: 'hidden',
        }}
      >
        <ModalClose />
        <Typography level="title-md" sx={{}}>
          Files in {taskName}
        </Typography>

        {/* <Box sx={{}}>
          <Chip size="sm" variant="soft" color="primary">
            {fileCount} {fileCount === 1 ? 'file' : 'files'}
          </Chip>
        </Box> */}

        {isLoading ? (
          <LinearProgress />
        ) : (
          <Box
            sx={{
              height: '100%',
              overflow: 'auto',
              p: 2,
            }}
          >
            {files.length === 0 ? (
              <Typography
                level="body-sm"
                color="neutral"
                sx={{ textAlign: 'center', py: 4 }}
              >
                No files found in src/ directory
              </Typography>
            ) : (
              <Box
                display="flex"
                gap={4}
                sx={{ height: '100%' }}
                id="task-gallery-files-container"
              >
                <Sheet
                  sx={{
                    gap: 2,
                    overflow: 'hidden',
                    flex: 1,
                    minWidth: '300px',
                  }}
                  variant="outlined"
                  id="task-gallery-files-list"
                >
                  <List size="sm">
                    {files.map((file, index) => (
                      <ListItem key={index}>
                        <ListItemButton>
                          <ListItemDecorator>
                            <FileIcon size={16} />
                          </ListItemDecorator>
                          <ListItemContent>
                            <Typography
                              level="body-sm"
                              sx={{ fontFamily: 'monospace' }}
                            >
                              {file}
                            </Typography>
                          </ListItemContent>
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Sheet>
                <Box
                  sx={{ flex: 3, height: '100%' }}
                  id="task-gallery-file-viewer"
                >
                  <Editor
                    defaultLanguage="shell"
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
                    // onMount={handleEditorDidMount}
                  />
                </Box>
              </Box>
            )}
          </Box>
        )}
      </ModalDialog>
    </Modal>
  );
}
