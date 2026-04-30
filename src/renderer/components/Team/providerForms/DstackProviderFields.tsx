import React from 'react';
import { FormControl, FormLabel, Input } from '@mui/joy';

interface DstackProviderFieldsProps {
  dstackServerUrl: string;
  setDstackServerUrl: (value: string) => void;
  dstackApiToken: string;
  setDstackApiToken: (value: string) => void;
  dstackProjectName: string;
  setDstackProjectName: (value: string) => void;
  providerId?: string;
  setDstackApiTokenChanged: (changed: boolean) => void;
}

export default function DstackProviderFields({
  dstackServerUrl,
  setDstackServerUrl,
  dstackApiToken,
  setDstackApiToken,
  dstackProjectName,
  setDstackProjectName,
  providerId,
  setDstackApiTokenChanged,
}: DstackProviderFieldsProps) {
  return (
    <>
      <FormControl sx={{ mt: 2 }}>
        <FormLabel>dstack Server URL *</FormLabel>
        <Input
          value={dstackServerUrl}
          onChange={(event) => setDstackServerUrl(event.currentTarget.value)}
          placeholder="http://0.0.0.0:3000"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>dstack API Token *</FormLabel>
        <Input
          value={dstackApiToken}
          onChange={(event) => {
            setDstackApiTokenChanged(true);
            setDstackApiToken(event.currentTarget.value);
          }}
          placeholder={
            providerId
              ? 'Leave blank to keep existing token'
              : 'Your dstack API token'
          }
          type="password"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>dstack Project Name *</FormLabel>
        <Input
          value={dstackProjectName}
          onChange={(event) => setDstackProjectName(event.currentTarget.value)}
          placeholder="main"
          fullWidth
        />
      </FormControl>
    </>
  );
}
