import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/joy';
import HexLogo from './HexLogo';

export default function FullPageLoader() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: 'var(--joy-palette-background-level1)',
        gap: 2,
      }}
    >
      <HexLogo width={40} height={40} />
      <Typography level="h4" sx={{ mb: 1 }}>
        Transformer Lab
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size="sm" />
        <Typography level="body-sm">Loading your workspace…</Typography>
      </Box>
    </Box>
  );
}
