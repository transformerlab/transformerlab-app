import * as React from 'react';
import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Stack,
} from '@mui/joy';
import type { SlurmFlag } from './types';
import { createSlurmFlag } from './slurmFlags';

interface SlurmFlagsSectionProps {
  flags: SlurmFlag[];
  onChange: (flags: SlurmFlag[]) => void;
  isSubmitting: boolean;
}

export default function SlurmFlagsSection({
  flags,
  onChange,
  isSubmitting,
}: SlurmFlagsSectionProps) {
  return (
    <FormControl>
      <FormLabel>Job-specific SBATCH flags (optional)</FormLabel>
      <Stack gap={1}>
        {flags.map((flag, idx) => (
          <Stack key={flag.id} direction="row" alignItems="center" gap={1}>
            <Input
              placeholder={idx === 0 ? '--time=4:00:00' : '--ntasks-per-node=4'}
              sx={{ fontFamily: 'monospace', fontSize: 'sm' }}
              value={flag.value}
              onChange={(e) =>
                onChange(
                  flags.map((f) =>
                    f.id === flag.id ? { ...f, value: e.target.value } : f,
                  ),
                )
              }
              disabled={isSubmitting}
            />
            {flags.length > 1 && (
              <Button
                size="sm"
                variant="outlined"
                color="neutral"
                onClick={() => {
                  const next = flags.filter((f) => f.id !== flag.id);
                  onChange(next.length > 0 ? next : [createSlurmFlag()]);
                }}
                disabled={isSubmitting}
              >
                Remove
              </Button>
            )}
          </Stack>
        ))}
        <Button
          size="sm"
          variant="outlined"
          onClick={() => onChange([...flags, createSlurmFlag()])}
          disabled={isSubmitting}
        >
          Add flag for this job
        </Button>
      </Stack>
      <FormHelperText>
        These flags apply only to this queued run and are added as #SBATCH
        directives in the SLURM script. They start from your defaults in User
        Settings → Provider Settings, but edits here affect this run only.
        Examples: --time=4:00:00, --ntasks-per-node=4.
      </FormHelperText>
    </FormControl>
  );
}
