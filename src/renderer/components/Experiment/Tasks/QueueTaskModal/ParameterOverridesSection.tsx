import * as React from 'react';
import { FormControl, FormLabel, Stack, Typography } from '@mui/joy';
import { ChevronDownIcon } from 'lucide-react';
import ParameterInput from './ParameterInput';
import type { ProcessedParameter } from './types';

interface ParameterOverridesSectionProps {
  show: boolean;
  onToggle: () => void;
  parameters: ProcessedParameter[];
  isSubmitting: boolean;
  customModelDataset: Set<number>;
  validationErrors: Record<number, string>;
  models: any[];
  datasets: any[];
  onValueChange: (index: number, value: any) => void;
  onValueChangeWithValidate: (index: number, value: any) => void;
  onToggleCustomModelDataset: (index: number, isCustom: boolean) => void;
}

export default function ParameterOverridesSection({
  show,
  onToggle,
  parameters,
  isSubmitting,
  customModelDataset,
  validationErrors,
  models,
  datasets,
  onValueChange,
  onValueChangeWithValidate,
  onToggleCustomModelDataset,
}: ParameterOverridesSectionProps) {
  const isEmpty =
    parameters.length === 0 ||
    (parameters.length === 1 && !parameters[0].key && !parameters[0].value);

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ cursor: isSubmitting ? 'default' : 'pointer' }}
        onClick={() => {
          if (!isSubmitting) onToggle();
        }}
      >
        <Typography level="title-sm">Parameter overrides</Typography>
        <ChevronDownIcon
          size={18}
          style={{
            transform: show ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </Stack>
      {show && (
        <Stack spacing={2}>
          {isEmpty ? (
            <Typography level="body-sm" color="neutral">
              This task has no parameters defined. Click Submit to queue with
              default configuration.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {parameters.map((param, index) => {
                const label = param.schema?.title || param.key;
                return (
                  <FormControl
                    key={param.key || `param-${index}`}
                    sx={{ width: '100%' }}
                  >
                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      sx={{ width: '100%' }}
                    >
                      <FormLabel sx={{ alignSelf: 'center', minWidth: 160 }}>
                        {label}:
                      </FormLabel>
                      <ParameterInput
                        param={param}
                        index={index}
                        isSubmitting={isSubmitting}
                        isCustomModelDataset={customModelDataset.has(index)}
                        validationError={validationErrors[index]}
                        models={models}
                        datasets={datasets}
                        onValueChange={onValueChange}
                        onValueChangeWithValidate={onValueChangeWithValidate}
                        onToggleCustomModelDataset={onToggleCustomModelDataset}
                      />
                    </Stack>
                  </FormControl>
                );
              })}
            </Stack>
          )}
          <Typography level="body-sm" color="neutral">
            Parameters can be accessed in your task script using{' '}
            <code>lab.get_config()</code>
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
