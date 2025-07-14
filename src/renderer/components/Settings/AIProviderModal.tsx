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

import { getAPIFullPath, useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

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

  const { data: apiKey, mutate: mutateApiKey } = useAPI('config', ['get'], {
    key: selectedProvider?.keyName,
  });

  const saveProvider = async (provider: Provider, token: string) => {
    await fetch(
      getAPIFullPath('config', ['set'], {
        key: provider.keyName,
        value: token,
      }),
    );
    mutateApiKey();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData(e.target as HTMLFormElement);
    const key = data.get('apiKey') as string;
    // if there is a value named apiKey, it means the thing to save
    // is just the one value, otherwise it is a JSON object with
    // a bunch of values as an object
    if (!key) {
      saveProvider(
        selectedProvider!,
        JSON.stringify(Object.fromEntries(data.entries())),
      );
    } else {
      saveProvider(selectedProvider!, key);
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
          ) : selectedProvider?.name === 'Azure OpenAI' ? (
            <>
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>API Version</FormLabel>
                <Input name="openai_api_version" />
              </FormControl>
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>Azure Deployment</FormLabel>
                <Input name="azure_deployment" />
              </FormControl>
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>Azure Endpoint</FormLabel>
                <Input name="azure_endpoint" />
              </FormControl>
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>API Key</FormLabel>
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
                  name="azure_openai_api_key"
                  type={showApiKey ? 'text' : 'password'}
                />
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
          {selectedProvider?.name === 'Azure OpenAI' && (
            <>
              <Typography level="title-md" mt={2}>
                Steps to get Azure OpenAI credentials:
              </Typography>
              <ol>
                <li>
                  Go to{' '}
                  <a
                    href="https://portal.azure.com/#blade/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/OpenAI"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Azure Portal - OpenAI Service
                  </a>
                </li>
                <li>Create or select your Azure OpenAI resource.</li>
                <li>
                  Navigate to Keys and Endpoint to find your API key and
                  endpoint.
                </li>
                <li>
                  Create a deployment in the Azure OpenAI Studio and note your
                  deployment name.
                </li>
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
