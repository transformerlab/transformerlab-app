import * as React from 'react';
import {
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Stack,
  Typography,
} from '@mui/joy';

interface TrackingSectionProps {
  useTrackio: boolean;
  onUseTrackioChange: (value: boolean) => void;
  trackioProjectName: string;
  onTrackioProjectNameChange: (value: string) => void;
  trackioProjects: string[];
  isSubmitting: boolean;
}

export default function TrackingSection({
  useTrackio,
  onUseTrackioChange,
  trackioProjectName,
  onTrackioProjectNameChange,
  trackioProjects,
  isSubmitting,
}: TrackingSectionProps) {
  return (
    <Stack spacing={2}>
      <Typography level="title-sm">Tracking</Typography>
      <FormControl orientation="horizontal" sx={{ alignItems: 'center' }}>
        <Checkbox
          checked={useTrackio}
          onChange={(e) => onUseTrackioChange(e.target.checked)}
          disabled={isSubmitting}
        />
        <FormLabel sx={{ ml: 1 }}>
          Enable Trackio metrics tracking for this run
        </FormLabel>
      </FormControl>
      {useTrackio && (
        <FormControl>
          <FormLabel>Project name</FormLabel>
          <Input
            placeholder="e.g. my-finetune-project"
            value={trackioProjectName}
            onChange={(e) => onTrackioProjectNameChange(e.target.value)}
            disabled={isSubmitting}
            slotProps={{
              input: { list: 'trackio-projects-list' },
            }}
          />
          <datalist id="trackio-projects-list">
            {trackioProjects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <FormHelperText>
            Pick an existing project to add this run to it, or type a new name
            to create one.
          </FormHelperText>
        </FormControl>
      )}
      <FormHelperText>
        When enabled, the scripts that use the lab SDK can automatically log
        metrics to Trackio and expose a Trackio dashboard in the UI.
      </FormHelperText>
    </Stack>
  );
}
