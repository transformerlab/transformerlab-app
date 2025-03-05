import * as React from 'react';
import {
  Button,
  Modal,
  ModalDialog,
  FormControl,
  FormLabel,
  Input,
  List,
  ListItem,
  Box,
  Typography,
  Chip,
} from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { ChevronLeftIcon } from 'lucide-react';
import AIProviderModal from './AIProviderModal';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Provider {
  name: string;
  keyName: string;
  setKeyEndpoint: () => string;
  checkKeyEndpoint: () => string;
}

const providers: Provider[] = [
  {
    name: 'OpenAI',
    keyName: 'OPENAI_API_KEY',
    setKeyEndpoint: () => chatAPI.Endpoints.Models.SetOpenAIKey(),
    checkKeyEndpoint: () => chatAPI.Endpoints.Models.CheckOpenAIAPIKey(),
  },
  {
    name: 'Anthropic',
    keyName: 'ANTHROPIC_API_KEY',
    setKeyEndpoint: () => chatAPI.Endpoints.Models.SetAnthropicKey(),
    checkKeyEndpoint: () => chatAPI.Endpoints.Models.CheckAnthropicAPIKey(),
  },
  {
    name: 'Custom API',
    keyName: 'CUSTOM_MODEL_API_KEY',
    setKeyEndpoint: () => chatAPI.Endpoints.Models.SetCustomAPIKey(),
    checkKeyEndpoint: () => chatAPI.Endpoints.Models.CheckCustomAPIKey(),
  },
];

interface AIProvidersSettingsProps {
  onBack?: () => void;
}

export default function AIProvidersSettings({
  onBack,
}: AIProvidersSettingsProps) {
  const { data: openaiApiKey, mutate: mutateOpenAI } = useSWR(
    chatAPI.Endpoints.Config.Get('OPENAI_API_KEY'),
    fetcher,
  );
  const { data: claudeApiKey, mutate: mutateClaude } = useSWR(
    chatAPI.Endpoints.Config.Get('ANTHROPIC_API_KEY'),
    fetcher,
  );
  const { data: customAPIStatus, mutate: mutateCustom } = useSWR(
    chatAPI.Endpoints.Config.Get('CUSTOM_MODEL_API_KEY'),
    fetcher,
  );

  const getProviderStatus = (provider: Provider) => {
    if (provider.name === 'OpenAI') return openaiApiKey;
    if (provider.name === 'Anthropic') return claudeApiKey;
    if (provider.name === 'Custom API') return customAPIStatus;
    return null;
  };

  const setProviderStatus = async (provider: Provider, token: string) => {
    await fetch(chatAPI.Endpoints.Config.Set(provider.keyName, token));
    await fetch(provider.setKeyEndpoint());
    const response = await fetch(provider.checkKeyEndpoint());
    const result = await response.json();
    return result.message === 'OK';
  };

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedProvider, setSelectedProvider] =
    React.useState<Provider | null>(null);
  const [apiKey, setApiKey] = React.useState('');
  const [hoveredProvider, setHoveredProvider] = React.useState<string | null>(
    null,
  );
  // States for custom API additional fields
  const [customApiName, setCustomApiName] = React.useState('');
  const [customBaseURL, setCustomBaseURL] = React.useState('');
  const [customApiKey, setCustomApiKey] = React.useState('');
  const [customModelName, setCustomModelName] = React.useState('');

  const handleConnectClick = (provider: Provider) => {
    setSelectedProvider(provider);
    if (provider.name === 'Custom API') {
      setCustomApiName('');
      setCustomBaseURL('');
      setCustomApiKey('');
      setCustomModelName('');
    } else {
      setApiKey('');
    }
    setDialogOpen(true);
  };

  const handleDisconnectClick = async (provider: Provider) => {
    await fetch(chatAPI.Endpoints.Config.Set(provider.keyName, ''));
    if (provider.name === 'OpenAI') {
      mutateOpenAI();
    } else if (provider.name === 'Anthropic') {
      mutateClaude();
    } else if (provider.name === 'Custom API') {
      mutateCustom();
    }
  };

  const handleSave = async () => {
    if (selectedProvider) {
      let token = '';
      if (selectedProvider.name === 'Custom API') {
        const customObj = {
          apiName: customApiName,
          baseURL: customBaseURL,
          apiKey: customApiKey,
          modelName: customModelName,
        };
        token = JSON.stringify(customObj);
      } else if (apiKey) {
        token = apiKey;
      }
      if (token) {
        const success = await setProviderStatus(selectedProvider, token);
        if (success) {
          alert(`Successfully connected to ${selectedProvider.name}`);
          if (selectedProvider.name === 'OpenAI') {
            mutateOpenAI();
          } else if (selectedProvider.name === 'Anthropic') {
            mutateClaude();
          } else if (selectedProvider.name === 'Custom API') {
            mutateCustom();
          }
        } else {
          alert(`Failed to connect to ${selectedProvider.name}`);
        }
      }
    }
    setDialogOpen(false);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Button
        onClick={onBack}
        startDecorator={<ChevronLeftIcon />}
        variant="plain"
      >
        Back to Settings
      </Button>
      <Typography level="h3" mb={2} mt={2}>
        AI Providers
      </Typography>
      <List sx={{ gap: 1 }}>
        {providers.map((provider) => {
          const status = getProviderStatus(provider);
          const isConnected = status && status !== '';
          return (
            <ListItem
              key={provider.name}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: 2,
                paddingLeft: 3,
                borderRadius: '8px',
                bgcolor: 'neutral.softBg',
              }}
            >
              <Typography level="title-md">{provider.name}</Typography>
              <Box>
                {isConnected && (
                  <>
                    <Chip variant="solid" color="success">
                      {hoveredProvider === provider.name
                        ? 'Not Connected'
                        : 'Connected'}
                    </Chip>
                  </>
                )}

                <Button
                  variant="soft"
                  onClick={() => handleConnectClick(provider)}
                  sx={{ ml: 1 }}
                >
                  Set API Key
                </Button>
              </Box>
            </ListItem>
          );
        })}
      </List>
      <AIProviderModal
        dialogOpen={dialogOpen}
        setDialogOpen={setDialogOpen}
        selectedProvider={selectedProvider}
        apiKey={apiKey}
        setApiKey={setApiKey}
        customApiName={customApiName}
        setCustomApiName={setCustomApiName}
        customBaseURL={customBaseURL}
        setCustomBaseURL={setCustomBaseURL}
        customApiKey={customApiKey}
        setCustomApiKey={setCustomApiKey}
        customModelName={customModelName}
        setCustomModelName={setCustomModelName}
        handleSave={handleSave}
      />
    </Box>
  );
}
