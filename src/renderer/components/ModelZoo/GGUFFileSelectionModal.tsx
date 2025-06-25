import React, { useState } from 'react';
import {
  Button,
  Modal,
  ModalDialog,
  ModalClose,
  Radio,
  RadioGroup,
  Typography,
  Box,
  Stack,
} from '@mui/joy';
import { DownloadIcon, FileIcon } from 'lucide-react';

interface GGUFFileSelectionModalProps {
  open: boolean;
  onClose: () => void;
  modelId: string;
  availableFiles: string[];
  onFileSelected: (filename: string) => void;
}

export default function GGUFFileSelectionModal({
  open,
  onClose,
  modelId,
  availableFiles,
  onFileSelected,
}: GGUFFileSelectionModalProps) {
  const [selectedFile, setSelectedFile] = useState<string>('');

  const handleDownload = () => {
    if (selectedFile) {
      onFileSelected(selectedFile);
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: '500px' }}>
        <ModalClose />

        <Typography level="h4" startDecorator={<FileIcon size={20} />}>
          Select GGUF File to Download
        </Typography>

        <Typography level="body-sm" sx={{ mb: 2 }}>
          <strong>{modelId}</strong> contains multiple GGUF files. Select one:
        </Typography>

        <RadioGroup
          value={selectedFile}
          onChange={(event) => setSelectedFile(event.target.value)}
          sx={{
            maxHeight: '300px',
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 'md',
            p: 1,
          }}
        >
          {availableFiles.map((filename) => (
            <Radio
              key={filename}
              value={filename}
              label={
                <Typography fontFamily="monospace" level="body-sm">
                  {filename}
                </Typography>
              }
              sx={{ py: 0.5 }}
            />
          ))}
        </RadioGroup>

        <Box
          sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}
        >
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button
            startDecorator={<DownloadIcon size={16} />}
            disabled={!selectedFile}
            onClick={handleDownload}
          >
            Download Selected File
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
