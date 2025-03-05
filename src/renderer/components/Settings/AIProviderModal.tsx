import * as React from 'react';
import {
  Button,
  Modal,
  ModalDialog,
  FormControl,
  FormLabel,
  Input,
  Box,
  Typography,
} from '@mui/joy';

interface Provider {
  name: string;
  keyName: string;
  setKeyEndpoint: () => string;
  checkKeyEndpoint: () => string;
}

interface AIProviderModalProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  selectedProvider: Provider | null;
  apiKey: string;
  setApiKey: (key: string) => void;
  customApiName: string;
  setCustomApiName: (name: string) => void;
  customBaseURL: string;
  setCustomBaseURL: (url: string) => void;
  customApiKey: string;
  setCustomApiKey: (key: string) => void;
  customModelName: string;
  setCustomModelName: (name: string) => void;
  handleSave: () => void;
}

export default function AIProviderModal({
  dialogOpen,
  setDialogOpen,
  selectedProvider,
  apiKey,
  setApiKey,
  customApiName,
  setCustomApiName,
  customBaseURL,
  setCustomBaseURL,
  customApiKey,
  setCustomApiKey,
  customModelName,
  setCustomModelName,
  handleSave,
}: AIProviderModalProps) {
  return (
    <Modal open={dialogOpen} onClose={() => setDialogOpen(false)}>
      <ModalDialog
        aria-labelledby="connect-dialog-title"
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: 400,
          width: '90%',
        }}
      >
        <Typography id="connect-dialog-title" component="h2">
          Connect to {selectedProvider?.name}
        </Typography>
        {selectedProvider?.name === 'Custom API' ? (
          <>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>API Name</FormLabel>
              <Input
                value={customApiName}
                onChange={(e) => setCustomApiName(e.target.value)}
              />
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Base URL</FormLabel>
              <Input
                value={customBaseURL}
                onChange={(e) => setCustomBaseURL(e.target.value)}
              />
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>API Key</FormLabel>
              <Input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
              />
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Model Name</FormLabel>
              <Input
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
              />
            </FormControl>
          </>
        ) : (
          <FormControl sx={{ mt: 2 }}>
            <FormLabel>{selectedProvider?.name} API Key</FormLabel>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </FormControl>
        )}
        {/* Conditional help steps */}
        {selectedProvider?.name === 'OpenAI' && (
          <Box sx={{ mt: 2 }}>
            <Typography level="body2">
              Steps to get an OpenAI API Key:
            </Typography>
            <ol>
              <li>
                Visit{' '}
                <a
                  href="https://platform.openai.com/account/api-keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenAI API website
                </a>
              </li>
              <li>Log in to your OpenAI account.</li>
              <li>Create a new API key and copy it.</li>
            </ol>
          </Box>
        )}
        {selectedProvider?.name === 'Anthropic' && (
          <Box sx={{ mt: 2 }}>
            <Typography level="body2">
              Steps to get a Anthropic API Key:
            </Typography>
            <ol>
              <li>
                Visit{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  Anthropic API Keys Console
                </a>
              </li>
              <li>Log in/Create an account.</li>
              <li>Follow instructions to generate an API key.</li>
            </ol>
          </Box>
        )}
        <Box
          sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}
        >
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
