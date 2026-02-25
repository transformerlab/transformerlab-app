import * as React from 'react';
import {
  FormControl,
  FormLabel,
  FormHelperText,
  Stack,
  Typography,
  Switch,
  Select,
  Option,
  Input,
  Button,
} from '@mui/joy';

interface ProcessedParameter {
  key: string;
  value: any;
  schema: {
    type?: string;
    title?: string;
  } | null;
  isShorthand: boolean;
}

interface SweepConfigSectionProps {
  runSweeps: boolean;
  onRunSweepsChange: (value: boolean) => void;
  sweepConfig: Record<string, any[]>;
  onSweepConfigChange: (config: Record<string, any[]>) => void;
  sweepMetric: string;
  onSweepMetricChange: (value: string) => void;
  lowerIsBetter: boolean;
  onLowerIsBetterChange: (value: boolean) => void;
  parameters: ProcessedParameter[];
}

export default function SweepConfigSection({
  runSweeps,
  onRunSweepsChange,
  sweepConfig,
  onSweepConfigChange,
  sweepMetric,
  onSweepMetricChange,
  lowerIsBetter,
  onLowerIsBetterChange,
  parameters,
}: SweepConfigSectionProps) {
  const [newSweepParam, setNewSweepParam] = React.useState('');
  const [newSweepValues, setNewSweepValues] = React.useState('');

  const handleAddSweepParam = () => {
    if (newSweepParam && newSweepValues.trim()) {
      const valuesArray = newSweepValues.split(',').map((val) => {
        const trimmedValue = val.trim();
        // Try to convert to number if possible
        const numValue = Number(trimmedValue);
        return isNaN(numValue) ? trimmedValue : numValue;
      });
      onSweepConfigChange({
        ...sweepConfig,
        [newSweepParam]: valuesArray,
      });
      setNewSweepParam('');
      setNewSweepValues('');
    }
  };

  const handleRemoveParam = (paramToRemove: string) => {
    const updated = { ...sweepConfig };
    delete updated[paramToRemove];
    onSweepConfigChange(updated);
  };

  return (
    <Stack spacing={2}>
      <Typography level="title-sm">Hyperparameter Sweeps</Typography>
      <FormControl>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <FormLabel>Run Hyperparameter Sweeps</FormLabel>
          <Switch
            checked={runSweeps}
            onChange={(e) => onRunSweepsChange(e.target.checked)}
            color={runSweeps ? 'success' : 'neutral'}
          />
        </Stack>
        <FormHelperText>
          Enable this to perform hyperparameter sweeps. Multiple jobs will be
          created with different parameter combinations.
        </FormHelperText>
      </FormControl>

      {runSweeps && (
        <Stack spacing={2}>
          {/* Add Sweep Parameter */}
          <Stack spacing={2}>
            <FormLabel>Add Parameter Sweep</FormLabel>
            <FormHelperText>
              Define parameters to sweep. Each parameter can have multiple
              values to try. The system will create a job for each combination.
            </FormHelperText>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <FormControl sx={{ minWidth: 200 }}>
                <FormLabel>Parameter</FormLabel>
                <Select
                  placeholder="Select a parameter"
                  value={newSweepParam || null}
                  onChange={(_, value) => setNewSweepParam(value || '')}
                >
                  {parameters
                    .filter(
                      (param) =>
                        param.key &&
                        !Object.keys(sweepConfig).includes(param.key),
                    )
                    .map((param) => (
                      <Option key={param.key} value={param.key}>
                        {param.schema?.title || param.key}
                      </Option>
                    ))}
                </Select>
              </FormControl>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Sweep Values (comma separated)</FormLabel>
                <Input
                  value={newSweepValues}
                  onChange={(e) => setNewSweepValues(e.target.value)}
                  placeholder="e.g. 1e-5, 3e-5, 5e-5"
                />
                <FormHelperText>
                  Enter values separated by commas
                </FormHelperText>
              </FormControl>
              <Button
                sx={{ mt: 3 }}
                onClick={handleAddSweepParam}
                disabled={!newSweepParam || !newSweepValues.trim()}
              >
                Add Parameter
              </Button>
            </Stack>
          </Stack>

          {/* Current Sweep Configuration */}
          {Object.keys(sweepConfig).length > 0 && (
            <Stack spacing={2}>
              <FormLabel>Current Sweep Configuration</FormLabel>
              <Stack spacing={1}>
                {Object.entries(sweepConfig).map(([param, values]) => (
                  <Stack
                    key={param}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      p: 1.5,
                      borderRadius: 'sm',
                      bgcolor: 'background.level1',
                    }}
                  >
                    <Stack>
                      <FormLabel>{param}</FormLabel>
                      <FormHelperText>
                        Values: {values.join(', ')}
                      </FormHelperText>
                    </Stack>
                    <Button
                      color="danger"
                      variant="soft"
                      size="sm"
                      onClick={() => handleRemoveParam(param)}
                    >
                      Remove
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          )}

          {/* Sweep Metric Configuration */}
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Sweep Metric</FormLabel>
              <Input
                value={sweepMetric}
                onChange={(e) => onSweepMetricChange(e.target.value)}
                placeholder="eval/loss"
              />
              <FormHelperText>
                Metric name to use for determining best configuration. Should
                match a metric logged by the task.
              </FormHelperText>
            </FormControl>
            <FormControl>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <FormLabel>Lower is Better</FormLabel>
                <Switch
                  checked={lowerIsBetter}
                  onChange={(e) => onLowerIsBetterChange(e.target.checked)}
                />
              </Stack>
              <FormHelperText>
                Whether lower values of the sweep metric are better. If
                disabled, higher values are better.
              </FormHelperText>
            </FormControl>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
