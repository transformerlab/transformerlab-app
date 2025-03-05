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
  IconButton,
} from '@mui/joy';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Provider {
  name: string;
  keyName: string;
}

export default function AIProviderModal({
  dialogOpen,
  setDialogOpen,
  selectedProvider,
}: {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  selectedProvider: Provider | null;
}) {
  const [showApiKey, setShowApiKey] = React.useState(false);
  const { data: apiKey, mutate: mutateApiKey } = useSWR(
    chatAPI.Endpoints.Config.Get(selectedProvider?.keyName),
    fetcher,
  );

  const saveProvider = async (provider: Provider, token: string) => {
    await fetch(chatAPI.Endpoints.Config.Set(provider.keyName, token));
    mutateApiKey();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData(e.target as HTMLFormElement);
    const apiKey = data.get('apiKey') as string;
    alert(JSON.stringify(Object.fromEntries(data.entries())));
    if (!apiKey) {
      saveProvider(selectedProvider!, JSON.stringify(Object.fromEntries(data.entries())));
    }
    else {
      saveProvider(selectedProvider!, apiKey);
    }
    setDialogOpen(false);
  };

  if (!selectedProvider) {
    return null;
  }

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
        <form onSubmit={handleSubmit}>
          {selectedProvider?.name === 'Custom API' ? (
            <>
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>API Name</FormLabel>
                <Input name="customApiName" />
              </FormControl>
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>Base URL</FormLabel>
                <Input name="customBaseURL" />
              </FormControl>
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>API Key</FormLabel>
                <Input name="customApiKey" type="password" />
              </FormControl>
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>Model Name</FormLabel>
                <Input name="customModelName" />
              </FormControl>
            </>
          ) : (
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>{selectedProvider?.name} API Key</FormLabel>
              <Input
                endDecorator={
                  <IconButton
                    onClick={() => {
                      setShowApiKey(!showApiKey);
                    }}
                  >
                    {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
                  </IconButton>
                }
                name="apiKey"
                type={showApiKey ? 'text' : 'password'}
                defaultValue={apiKey}
              />
            </FormControl>
          )}
          {/* Conditional help steps */}
          {selectedProvider?.name === 'OpenAI' && (
            <>
              <Typography level="title-md" mt={2}>
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
            </>
          )}
          {selectedProvider?.name === 'Anthropic' && (
            <>
              <Typography level="title-md" mt={2}>
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
            </>
          )}
          <Box
            sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}
          >
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </Box>
        </form>
      </ModalDialog>
    </Modal>
  );
}
