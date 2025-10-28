import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
  Box,
  LinearProgress,
  Sheet,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
} from '@mui/joy';
import { FileIcon } from 'lucide-react';
import { Editor } from '@monaco-editor/react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

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
  taskDir: string;
  files: string[];
  isLoading: boolean;
}

export default function TaskFilesModal({
  open,
  onClose,
  taskName,
  taskDir,
  files,
  isLoading,
}: TaskFilesModalProps) {
  const editorRef = useRef<any>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Reset selectedFile when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      // Reset editor content when modal closes
      if (editorRef?.current) {
        editorRef.current.setValue('Select a file to view its content');
        editorRef.current.updateOptions({
          readOnly: true,
        });
        editorRef.current.layout();
      }
    }
  }, [open]);

  // Fetch the file contents when a file is selected
  const { data: fileContent, error: fileError } = useSWR(
    selectedFile && taskDir
      ? chatAPI.Endpoints.Tasks.GetTaskFileContent(taskDir, selectedFile)
      : null,
    fetcher,
  );

  useEffect(() => {
    if (fileContent?.status === 'success' && fileContent?.data?.content) {
      if (editorRef?.current) {
        if (fileContent.data.encoding === 'base64') {
          // Handle binary files - decode base64 content
          try {
            const decodedContent = atob(fileContent.data.content);
            editorRef.current.setValue(decodedContent);
          } catch (e) {
            editorRef.current.setValue('Binary file - cannot display content');
          }
        } else {
          // Handle text files
          editorRef.current.setValue(fileContent.data.content);
        }
        editorRef.current.updateOptions({
          readOnly: true,
        });
        editorRef.current.layout();
      }
    } else if (fileError || fileContent?.status === 'error') {
      if (editorRef?.current) {
        editorRef.current.setValue('Error loading file content');
        editorRef.current.updateOptions({
          readOnly: true,
        });
        editorRef.current.layout();
      }
    }
  }, [fileContent, fileError]);

  function handleEditorDidMount(editor: any, monaco: any) {
    editorRef.current = editor;
    if (selectedFile) {
      editor.setValue('Loading file content...');
    } else {
      editor.setValue('Select a file to view its content');
    }
    editor.updateOptions({
      readOnly: true,
    });
    setTheme(editor, monaco);
  }

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    handleEditorDidMount(editor, monaco);
  };

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
                    {files.map((file) => (
                      <ListItem key={file}>
                        <ListItemButton
                          onClick={() => handleFileSelect(file)}
                          selected={selectedFile === file}
                        >
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
                    onMount={handleEditorMount}
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
