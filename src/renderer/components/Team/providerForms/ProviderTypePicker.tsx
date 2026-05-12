import React from 'react';
import { Box, Card, FormControl, FormLabel, Typography } from '@mui/joy';

export interface ProviderTypeOption {
  value: string;
  label: string;
  description: string;
}

interface ProviderTypePickerProps {
  options: ProviderTypeOption[];
  onSelect: (providerType: string) => void;
}

function activateCardKey(event: React.KeyboardEvent, onActivate: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onActivate();
  }
}

export default function ProviderTypePicker({
  options,
  onSelect,
}: ProviderTypePickerProps) {
  return (
    <FormControl sx={{ mt: 2 }}>
      <FormLabel>Choose Compute Provider Type</FormLabel>
      <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
        Pick a provider to open its setup form.
      </Typography>
      <Box
        sx={{
          mt: 1.5,
          display: 'grid',
          gap: 1.25,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
          },
        }}
      >
        {options.map((option) => (
          <Card
            key={option.value}
            role="button"
            tabIndex={0}
            variant="outlined"
            onClick={() => onSelect(option.value)}
            onKeyDown={(e) => activateCardKey(e, () => onSelect(option.value))}
            sx={{
              cursor: 'pointer',
              outlineOffset: 2,
              transition:
                'background-color 0.15s, border-color 0.15s, box-shadow 0.15s',
              '&:hover': {
                borderColor: 'primary.outlinedHoverBorder',
                bgcolor: 'background.level1',
                boxShadow: 'sm',
              },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.500',
              },
            }}
          >
            <Typography level="title-sm">{option.label}</Typography>
            <Typography
              level="body-sm"
              sx={{ mt: 0.75, color: 'text.tertiary' }}
            >
              {option.description}
            </Typography>
          </Card>
        ))}
      </Box>
    </FormControl>
  );
}
