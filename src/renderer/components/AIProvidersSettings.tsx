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
    Typography
} from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';

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
    }
];

interface AIProvidersSettingsProps {
    onBack?: () => void;
}

export default function AIProvidersSettings({ onBack }: AIProvidersSettingsProps) {
    const { data: openaiApiKey, mutate: mutateOpenAI } = useSWR(
        chatAPI.Endpoints.Config.Get('OPENAI_API_KEY'),
        fetcher
    );
    const { data: claudeApiKey, mutate: mutateClaude } = useSWR(
        chatAPI.Endpoints.Config.Get('ANTHROPIC_API_KEY'),
        fetcher
    );
    const { data: customAPIStatus, mutate: mutateCustom } = useSWR(
        chatAPI.Endpoints.Config.Get('CUSTOM_MODEL_API_KEY'),
        fetcher
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
    const [selectedProvider, setSelectedProvider] = React.useState<Provider | null>(null);
    const [apiKey, setApiKey] = React.useState('');
    const [hoveredProvider, setHoveredProvider] = React.useState<string | null>(null);
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
                    modelName: customModelName
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
            <Button onClick={onBack}>Back to Settings</Button>
            <Typography level="h3" mb={2}>
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
                                p: 1,
                                borderRadius: '8px',
                                bgcolor: 'neutral.softBg'
                            }}
                        >
                            <Typography>{provider.name}</Typography>
                            {isConnected ? (
                                <Box
                                    onMouseEnter={() => setHoveredProvider(provider.name)}
                                    onMouseLeave={() => setHoveredProvider(null)}
                                    onClick={() => handleDisconnectClick(provider)}
                                    sx={{
                                        cursor: 'pointer',
                                        border: '1px solid',
                                        borderColor: 'neutral.outlinedBorder',
                                        borderRadius: '4px',
                                        px: 1,
                                        py: 0.5,
                                        fontSize: '0.875rem',
                                        color: 'success.600'
                                    }}
                                >
                                    {hoveredProvider === provider.name ? 'Disconnect' : 'Set up!'}
                                </Box>
                            ) : (
                                <Button variant="soft" onClick={() => handleConnectClick(provider)}>
                                    Connect
                                </Button>
                            )}
                        </ListItem>
                    );
                })}
            </List>
            {/* API Key Modal */}
            <Modal open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <ModalDialog
                    layout="stack"
                    aria-labelledby="connect-dialog-title"
                    sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        maxWidth: 400,
                        width: '90%'
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
                                        OpenAI API Keys
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
                                <li>Visit your Claude provider’s website.</li>
                                <li>Log in/create an account.</li>
                                <li>Follow instructions to generate an API key.</li>
                            </ol>
                        </Box>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                        <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave}>Save</Button>
                    </Box>
                </ModalDialog>
            </Modal>
        </Box>
    );
}
