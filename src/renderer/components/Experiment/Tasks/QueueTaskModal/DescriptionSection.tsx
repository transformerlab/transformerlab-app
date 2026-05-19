import * as React from 'react';
import {
  FormControl,
  FormHelperText,
  FormLabel,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy';
import { ChevronDownIcon } from 'lucide-react';

interface DescriptionSectionProps {
  show: boolean;
  onToggle: () => void;
  value: string;
  onChange: (value: string) => void;
  isSubmitting: boolean;
}

export default function DescriptionSection({
  show,
  onToggle,
  value,
  onChange,
  isSubmitting,
}: DescriptionSectionProps) {
  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ cursor: isSubmitting ? 'default' : 'pointer' }}
        onClick={() => {
          if (!isSubmitting) onToggle();
        }}
      >
        <Typography level="title-sm">Add description (optional)</Typography>
        <ChevronDownIcon
          size={18}
          style={{
            transform: show ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </Stack>
      {show && (
        <FormControl>
          <FormLabel>Run description</FormLabel>
          <Textarea
            minRows={3}
            maxRows={8}
            placeholder="Describe what changed, your hypothesis, and what to watch for in this run."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={isSubmitting}
          />
          <FormHelperText>
            Stored with the job and shown in job details. Markdown is supported.
          </FormHelperText>
        </FormControl>
      )}
    </Stack>
  );
}
