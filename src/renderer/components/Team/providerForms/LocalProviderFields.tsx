import React from 'react';
import { Box, FormControl, FormLabel, Switch, Typography } from '@mui/joy';

interface LocalProviderFieldsProps {
  forceRefresh: boolean;
  setForceRefresh: (value: boolean) => void;
}

export default function LocalProviderFields({
  forceRefresh,
  setForceRefresh,
}: LocalProviderFieldsProps) {
  return (
    <FormControl
      orientation="horizontal"
      sx={{ mt: 1, alignItems: 'center', gap: 1 }}
    >
      <Box>
        <FormLabel>Force fresh install</FormLabel>
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          Delete the existing conda environment, install log, and config and run
          a clean install from scratch.
        </Typography>
      </Box>
      <Switch
        checked={forceRefresh}
        onChange={(event) => setForceRefresh(event.target.checked)}
      />
    </FormControl>
  );
}
