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
} from '@mui/joy';
import { FileIcon, FolderIcon } from 'lucide-react';

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
          maxWidth: 500,
          width: '100%',
          maxHeight: '80vh',
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
              maxHeight: '60vh',
              overflow: 'auto',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 'sm',
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
              <Stack spacing={1}>
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
              </Stack>
            )}
          </Box>
        )}
      </ModalDialog>
    </Modal>
  );
}
