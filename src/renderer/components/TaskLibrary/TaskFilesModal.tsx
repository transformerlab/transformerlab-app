import React from 'react';
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
} from '@mui/joy';
import { FileIcon, FolderIcon } from 'lucide-react';
import { Editor } from '@monaco-editor/react';

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
        <Typography level="title-md" sx={{ mb: 2 }}>
          Files in {taskName}
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Chip size="sm" variant="soft" color="primary">
            {fileCount} {fileCount === 1 ? 'file' : 'files'}
          </Chip>
        </Box>

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
              <Box display="flex" gap={4} sx={{ height: '100%' }}>
                <Sheet
                  sx={{ width: 300, gap: 2, overflow: 'hidden' }}
                  variant="outlined"
                >
                  {files.map((file, index) => (
                    <Box
                      key={index}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: 'sm',
                        '&:hover': {
                          backgroundColor: 'background.level1',
                        },
                      }}
                    >
                      <FileIcon size={16} />
                      <Typography
                        level="body-sm"
                        sx={{ fontFamily: 'monospace' }}
                      >
                        {file}
                      </Typography>
                    </Box>
                  ))}
                </Sheet>
                <Box sx={{ flex: 1, height: '100%' }}>
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
                    onMount={() => {}}
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
