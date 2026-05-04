/* eslint-disable react/require-default-props */
import React from 'react';
import {
  Box,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Typography,
} from '@mui/joy';

interface NebiusProviderFieldsProps {
  nebiusServiceAccountId: string;
  setNebiusServiceAccountId: (value: string) => void;
  nebiusPublicKeyId: string;
  setNebiusPublicKeyId: (value: string) => void;
  nebiusPrivateKey: string;
  setNebiusPrivateKey: (value: string) => void;
  providerId?: string;
}

export default function NebiusProviderFields({
  nebiusServiceAccountId,
  setNebiusServiceAccountId,
  nebiusPublicKeyId,
  setNebiusPublicKeyId,
  nebiusPrivateKey,
  setNebiusPrivateKey,
  providerId = undefined,
}: NebiusProviderFieldsProps) {
  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
        Nebius uses service-account credentials stored in a provider-scoped CLI
        config on the API server. Each provider gets its own Nebius config and
        private key file, so one org can have multiple Nebius providers.
      </Typography>
      <FormControl>
        <FormLabel>Service Account ID{providerId ? '' : ' *'}</FormLabel>
        <Input
          value={nebiusServiceAccountId}
          onChange={(event) =>
            setNebiusServiceAccountId(event.currentTarget.value)
          }
          placeholder="serviceaccount-..."
          fullWidth
        />
      </FormControl>
      <FormControl>
        <FormLabel>Public Key ID{providerId ? '' : ' *'}</FormLabel>
        <Input
          value={nebiusPublicKeyId}
          onChange={(event) => setNebiusPublicKeyId(event.currentTarget.value)}
          placeholder="public-key-id"
          fullWidth
        />
      </FormControl>
      <FormControl>
        <FormLabel>Private Key{providerId ? '' : ' *'}</FormLabel>
        <Textarea
          value={nebiusPrivateKey}
          onChange={(event) => setNebiusPrivateKey(event.currentTarget.value)}
          placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
          minRows={5}
          maxRows={10}
        />
        {providerId ? (
          <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
            Leave credential fields blank to keep the existing Nebius
            credentials.
          </Typography>
        ) : null}
      </FormControl>
    </Box>
  );
}
