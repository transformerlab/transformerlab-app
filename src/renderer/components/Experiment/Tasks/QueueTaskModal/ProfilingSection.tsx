import * as React from 'react';
import {
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Stack,
  Typography,
} from '@mui/joy';

interface ProfilingSectionProps {
  useProfiling: boolean;
  onUseProfilingChange: (value: boolean) => void;
  useProfilingTorch: boolean;
  onUseProfilingTorchChange: (value: boolean) => void;
  isSubmitting: boolean;
}

export default function ProfilingSection({
  useProfiling,
  onUseProfilingChange,
  useProfilingTorch,
  onUseProfilingTorchChange,
  isSubmitting,
}: ProfilingSectionProps) {
  return (
    <Stack spacing={2}>
      <Typography level="title-sm">Profiling</Typography>
      <FormControl orientation="horizontal" sx={{ alignItems: 'center' }}>
        <Checkbox
          checked={useProfiling}
          onChange={(e) => {
            onUseProfilingChange(e.target.checked);
            if (!e.target.checked) onUseProfilingTorchChange(false);
          }}
          disabled={isSubmitting}
        />
        <FormLabel sx={{ ml: 1 }}>
          Enable CPU &amp; GPU profiling for this run
        </FormLabel>
      </FormControl>
      <FormHelperText>
        Samples CPU%, memory, and GPU utilization every few seconds during the
        job. Results are available in the Profiling tab after the job completes.
      </FormHelperText>
      {useProfiling && (
        <FormControl
          orientation="horizontal"
          sx={{ alignItems: 'center', ml: 3 }}
        >
          <Checkbox
            checked={useProfilingTorch}
            onChange={(e) => onUseProfilingTorchChange(e.target.checked)}
            disabled={isSubmitting}
          />
          <FormLabel sx={{ ml: 1 }}>
            Also capture PyTorch op-level trace (Chrome trace format)
          </FormLabel>
        </FormControl>
      )}
    </Stack>
  );
}
