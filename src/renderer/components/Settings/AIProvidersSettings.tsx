import * as React from 'react';
import { Button, List, ListItem, Box, Typography, Chip } from '@mui/joy';
import { ChevronLeftIcon } from 'lucide-react';
import AIProviderModal from './AIProviderModal';

const providers = [
  {
    name: 'OpenAI',
    keyName: 'OPENAI_API_KEY',
  },
  {
    name: 'Azure OpenAI',
    keyName: 'AZURE_OPENAI_DETAILS',
  },
  {
    name: 'Anthropic',
    keyName: 'ANTHROPIC_API_KEY',
  },
  {
    name: 'Custom API',
    keyName: 'CUSTOM_MODEL_API_KEY',
  },
];

export default function AIProvidersSettings({
  onBack,
}: {
  onBack?: () => void;
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedProvider, setSelectedProvider] = React.useState(null);

  const handleConnectClick = (provider) => {
    setSelectedProvider(provider);
    setDialogOpen(true);
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
          const status = false;
          const isConnected = status && status !== '';
          return (
            <ListItem
              variant="soft"
              key={provider.name}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: 2,
                paddingLeft: 3,
                borderRadius: '8px',
              }}
            >
              <Typography level="title-md">{provider.name}</Typography>
              <Box>
                {isConnected && (
                  <>
                    <Chip variant="solid" color="success">
                      Connected
                    </Chip>
                  </>
                )}

                <Button
                  variant="outlined"
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
      />
    </Box>
  );
}
