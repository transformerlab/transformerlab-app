import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  FormControl,
  FormLabel,
  Input,
  Button,
  IconButton,
  Alert,
  Stack,
} from '@mui/joy';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

interface LatticeLoginModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (apiKey: string, apiUrl: string) => void;
  existingApiKey?: string;
  existingApiUrl?: string;
}

export default function LatticeLoginModal({
  open,
  onClose,
  onSave,
  existingApiKey = '',
  existingApiUrl = '',
}: LatticeLoginModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState('');

  // Set the existing values when modal opens
  useEffect(() => {
    if (open) {
      setApiKey(existingApiKey || '');
      setApiUrl(existingApiUrl || '');
    }
  }, [open, existingApiKey, existingApiUrl]);

  const handleSave = () => {
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }
    if (!apiUrl.trim()) {
      setError('API URL is required');
      return;
    }
    onSave(apiKey.trim(), apiUrl.trim());
    setApiKey('');
    setApiUrl('');
    setError('');
    onClose();
  };

  const handleClose = () => {
    setApiKey('');
    setApiUrl('');
    setError('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ minWidth: 400, maxWidth: 500 }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          Login to Lattice
        </Typography>

        {error && (
          <Alert color="danger" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <FormControl sx={{ mb: 2 }}>
          <FormLabel>API URL</FormLabel>
          <Input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="Enter the Lattice API URL (e.g., http://localhost:8000)"
          />
        </FormControl>

        <FormControl sx={{ mb: 2 }}>
          <FormLabel>API Key</FormLabel>
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type={showApiKey ? 'text' : 'password'}
            placeholder="Enter your Lattice API key"
            endDecorator={
              <IconButton onClick={() => setShowApiKey(!showApiKey)} size="sm">
                {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
              </IconButton>
            }
          />
        </FormControl>

        <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
          <Button variant="plain" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
