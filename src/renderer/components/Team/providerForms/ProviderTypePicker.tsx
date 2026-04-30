import React, { useState } from 'react';
import { FormControl, FormLabel, Option, Select, Typography } from '@mui/joy';

export interface ProviderTypeOption {
  value: string;
  label: string;
  description: string;
}

interface ProviderTypePickerProps {
  options: ProviderTypeOption[];
  onSelect: (providerType: string) => void;
}

export default function ProviderTypePicker({
  options,
  onSelect,
}: ProviderTypePickerProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  return (
    <FormControl sx={{ mt: 2 }}>
      <FormLabel>Choose Compute Provider Type</FormLabel>
      <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
        Select a provider type to open its dedicated setup form.
      </Typography>
      <Select
        value={selectedType}
        placeholder="Select provider type"
        sx={{ mt: 1 }}
        onChange={(event, value) => {
          if (!value) return;
          setSelectedType(value);
          onSelect(value);
        }}
      >
        {options.map((option) => (
          <Option key={option.value} value={option.value}>
            <div>
              <Typography level="title-sm">{option.label}</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {option.description}
              </Typography>
            </div>
          </Option>
        ))}
      </Select>
    </FormControl>
  );
}
