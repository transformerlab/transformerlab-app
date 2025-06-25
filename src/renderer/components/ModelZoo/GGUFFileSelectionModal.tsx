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
  Chip,
} from '@mui/joy';
import { DownloadIcon, FileIcon } from 'lucide-react';
import { formatBytes } from '../../lib/utils';

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

  const getFileSize = (filename: string) => {
    // Try to get file size from model_details if available
    if (modelDetails?.siblings) {
      const fileInfo = modelDetails.siblings.find(
        (file: any) => file.rfilename === filename,
      );
      return fileInfo?.size ? formatBytes(fileInfo.size) : 'Unknown size';
    }
    return 'Unknown size';
  };

  const getFileType = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'gguf') {
      // Extract quantization type from filename if available
      const quantMatch = filename.match(/[_-]([QF]\d+[_K]?)/i);
      return quantMatch ? quantMatch[1] : 'GGUF';
    }
    return extension?.toUpperCase() || 'Unknown';
  };

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
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>File Name</th>
                      <th>Type</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableFiles.map((filename) => (
                      <tr key={filename}>
                        <td>
                          <Radio value={filename} />
                        </td>
                        <td>
                          <Typography level="body-sm" fontFamily="monospace">
                            {filename}
                          </Typography>
                        </td>
                        <td>
                          <Chip size="sm" variant="soft" color="primary">
                            {getFileType(filename)}
                          </Chip>
                        </td>
                        <td>
                          <Typography level="body-sm" color="neutral">
                            {getFileSize(filename)}
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
