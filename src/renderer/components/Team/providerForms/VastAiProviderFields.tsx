import React from 'react';
import { FormControl, FormLabel, Input, Typography } from '@mui/joy';

interface VastAiProviderFieldsProps {
  vastAiApiKey: string;
  setVastAiApiKey: (value: string) => void;
  providerId?: string;
  setVastAiApiKeyChanged: (changed: boolean) => void;
}

export default function VastAiProviderFields({
  vastAiApiKey,
  setVastAiApiKey,
  providerId,
  setVastAiApiKeyChanged,
}: VastAiProviderFieldsProps) {
  return (
    <FormControl sx={{ mt: 2 }}>
      <FormLabel>Vast.ai API Key *</FormLabel>
      <Input
        value={vastAiApiKey}
        onChange={(event) => {
          setVastAiApiKeyChanged(true);
          setVastAiApiKey(event.currentTarget.value);
        }}
        placeholder={
          providerId
            ? 'Leave blank to keep existing key'
            : 'Your Vast.ai API key'
        }
        type="password"
        fullWidth
      />
      <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
        Find your API key at console.vast.ai → Account → API Keys.
      </Typography>
    </FormControl>
  );
}
