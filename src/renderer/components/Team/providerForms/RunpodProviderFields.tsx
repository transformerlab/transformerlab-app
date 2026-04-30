import React from 'react';
import { FormControl, FormLabel, Input, Typography } from '@mui/joy';

interface RunpodProviderFieldsProps {
  runpodApiKey: string;
  setRunpodApiKey: (value: string) => void;
  runpodApiBaseUrl: string;
  setRunpodApiBaseUrl: (value: string) => void;
  providerId?: string;
  setRunpodApiKeyChanged: (changed: boolean) => void;
}

export default function RunpodProviderFields({
  runpodApiKey,
  setRunpodApiKey,
  runpodApiBaseUrl,
  setRunpodApiBaseUrl,
  providerId,
  setRunpodApiKeyChanged,
}: RunpodProviderFieldsProps) {
  return (
    <>
      <FormControl sx={{ mt: 2 }}>
        <FormLabel>RunPod API Key *</FormLabel>
        <Input
          value={runpodApiKey}
          onChange={(event) => {
            setRunpodApiKeyChanged(true);
            setRunpodApiKey(event.currentTarget.value);
          }}
          placeholder={
            providerId
              ? 'Leave blank to keep existing key'
              : 'Your RunPod API key'
          }
          type="password"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>API Base URL</FormLabel>
        <Input
          value={runpodApiBaseUrl}
          onChange={(event) => setRunpodApiBaseUrl(event.currentTarget.value)}
          placeholder="https://rest.runpod.io/v1"
          fullWidth
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Leave blank to use the default RunPod API endpoint.
        </Typography>
      </FormControl>
    </>
  );
}
