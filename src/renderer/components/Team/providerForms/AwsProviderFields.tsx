import React from 'react';
import { Box, FormControl, FormLabel, Input, Typography } from '@mui/joy';

interface AwsProviderFieldsProps {
  awsRegion: string;
  setAwsRegion: (value: string) => void;
  awsAccessKeyId: string;
  setAwsAccessKeyId: (value: string) => void;
  awsSecretAccessKey: string;
  setAwsSecretAccessKey: (value: string) => void;
  awsProfile?: string;
}

export default function AwsProviderFields({
  awsRegion,
  setAwsRegion,
  awsAccessKeyId,
  setAwsAccessKeyId,
  awsSecretAccessKey,
  setAwsSecretAccessKey,
  awsProfile,
}: AwsProviderFieldsProps) {
  return (
    <>
      <FormControl sx={{ mt: 2 }}>
        <FormLabel>Region *</FormLabel>
        <Input
          value={awsRegion}
          onChange={(event) => setAwsRegion(event.currentTarget.value)}
          placeholder="us-east-1"
          fullWidth
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          AWS region where instances will be launched.
        </Typography>
      </FormControl>

      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <FormControl>
          <FormLabel>Access Key ID</FormLabel>
          <Input
            value={awsAccessKeyId}
            onChange={(event) => setAwsAccessKeyId(event.currentTarget.value)}
            placeholder="AKIA..."
            fullWidth
          />
        </FormControl>
        <FormControl>
          <FormLabel>Secret Access Key</FormLabel>
          <Input
            value={awsSecretAccessKey}
            onChange={(event) =>
              setAwsSecretAccessKey(event.currentTarget.value)
            }
            type="password"
            placeholder="Your AWS secret access key"
            fullWidth
          />
        </FormControl>
      </Box>
    </>
  );
}
