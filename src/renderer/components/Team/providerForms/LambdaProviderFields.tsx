import React from 'react';
import { FormControl, FormLabel, Input, Typography } from '@mui/joy';

interface LambdaProviderFieldsProps {
  lambdaApiKey: string;
  setLambdaApiKey: (value: string) => void;
  lambdaRegion: string;
  setLambdaRegion: (value: string) => void;
  lambdaFileSystemNames: string;
  setLambdaFileSystemNames: (value: string) => void;
  providerId?: string;
  setLambdaApiKeyChanged: (changed: boolean) => void;
}

export default function LambdaProviderFields({
  lambdaApiKey,
  setLambdaApiKey,
  lambdaRegion,
  setLambdaRegion,
  lambdaFileSystemNames,
  setLambdaFileSystemNames,
  providerId,
  setLambdaApiKeyChanged,
}: LambdaProviderFieldsProps) {
  return (
    <>
      <FormControl sx={{ mt: 2 }}>
        <FormLabel>Lambda Labs API Key *</FormLabel>
        <Input
          value={lambdaApiKey}
          onChange={(event) => {
            setLambdaApiKeyChanged(true);
            setLambdaApiKey(event.currentTarget.value);
          }}
          placeholder={
            providerId
              ? 'Leave blank to keep existing key'
              : 'Your Lambda Labs API key'
          }
          type="password"
          fullWidth
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Generate an API key at{' '}
          <a
            href="https://cloud.lambdalabs.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
          >
            cloud.lambdalabs.com/api-keys
          </a>
          .
        </Typography>
      </FormControl>

      <FormControl sx={{ mt: 1 }}>
        <FormLabel>Default Region</FormLabel>
        <Input
          value={lambdaRegion}
          onChange={(event) => setLambdaRegion(event.currentTarget.value)}
          placeholder="us-east-1"
          fullWidth
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Lambda region name (e.g. "us-east-1", "us-west-1",
          "europe-central-1").
        </Typography>
      </FormControl>

      <FormControl sx={{ mt: 1 }}>
        <FormLabel>File System Names</FormLabel>
        <Input
          value={lambdaFileSystemNames}
          onChange={(event) =>
            setLambdaFileSystemNames(event.currentTarget.value)
          }
          placeholder="shared-fs"
          fullWidth
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Optional comma-separated names of persistent filesystems to attach.
        </Typography>
      </FormControl>
    </>
  );
}
