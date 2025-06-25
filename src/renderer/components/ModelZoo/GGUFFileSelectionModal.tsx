import React, { useState } from 'react';
import {
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
  Radio,
  RadioGroup,
  Sheet,
  Stack,
  Table,
  Typography,
  Box,
} from '@mui/joy';
import { DownloadIcon, FileIcon } from 'lucide-react';

interface GGUFFileSelectionModalProps {
  open: boolean;
  onClose: () => void;
  modelId: string;
  availableFiles: string[];
  modelDetails?: any;
  onFileSelected: (filename: string) => void;
}

export default function GGUFFileSelectionModal({
  open,
  onClose,
  modelId,
  availableFiles,
  modelDetails,
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
      <ModalDialog size="lg" sx={{ minWidth: '600px' }}>
        <ModalClose />
        <DialogTitle>
          <FileIcon size={20} style={{ marginRight: '8px' }} />
          Select GGUF File to Download
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            <Box>
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Model Repository: <strong>{modelId}</strong>
              </Typography>
              <Typography level="body-sm" color="neutral">
                This repository contains multiple GGUF files. Please select one
                to download:
              </Typography>
            </Box>

            <Sheet variant="outlined" sx={{ borderRadius: 'md', p: 2 }}>
              <RadioGroup
                value={selectedFile}
                onChange={(event) => setSelectedFile(event.target.value)}
              >
                <Table size="sm">
                  <tbody>
                    {availableFiles.map((filename) => (
                      <tr key={filename}>
                        <td style={{ width: '40px', padding: '8px' }}>
                          <Radio value={filename} />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Typography level="body-sm" fontFamily="monospace">
                            {filename}
                          </Typography>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </RadioGroup>
            </Sheet>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
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
          </Stack>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
