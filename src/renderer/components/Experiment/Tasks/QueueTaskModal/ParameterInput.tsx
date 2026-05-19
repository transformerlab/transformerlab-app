import * as React from 'react';
import {
  FormHelperText,
  Input,
  Option,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Stack,
  Switch,
  Checkbox,
  Typography,
} from '@mui/joy';
import Editor from 'renderer/components/Shared/LazyMonacoEditor';
import { setTheme } from 'renderer/lib/monacoConfig';
import type { ParameterType, ProcessedParameter } from './types';

interface ParameterInputProps {
  param: ProcessedParameter;
  index: number;
  isSubmitting: boolean;
  isCustomModelDataset: boolean;
  validationError: string | undefined;
  models: any[];
  datasets: any[];
  onValueChange: (index: number, value: any) => void;
  onValueChangeWithValidate: (index: number, value: any) => void;
  onToggleCustomModelDataset: (index: number, isCustom: boolean) => void;
}

function getParameterType(param: ProcessedParameter): ParameterType {
  if (param.schema?.type) {
    return param.schema.type;
  }
  const val = param.value;
  if (typeof val === 'boolean') return 'bool';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? 'int' : 'float';
  }
  if (Array.isArray(val)) return 'string';
  if (typeof val === 'object' && val !== null) return 'string';
  return 'string';
}

export default function ParameterInput({
  param,
  index,
  isSubmitting,
  isCustomModelDataset,
  validationError,
  models,
  datasets,
  onValueChange,
  onValueChangeWithValidate,
  onToggleCustomModelDataset,
}: ParameterInputProps) {
  const schema = param.schema;
  const type = getParameterType(param);
  const uiWidget = schema?.ui_widget;

  if (uiWidget === 'lab_model_select' || uiWidget === 'lab_dataset_select') {
    const isModelSelect = uiWidget === 'lab_model_select';
    const items = isModelSelect ? models : datasets;
    const placeholder = isModelSelect ? 'Select a model' : 'Select a dataset';
    const customPlaceholder = isModelSelect
      ? 'Enter any model name'
      : 'Enter any dataset name';
    const optionKey = isModelSelect ? 'model_id' : 'dataset_id';

    return (
      <Stack direction="column" spacing={1} sx={{ flex: 1 }}>
        {isCustomModelDataset ? (
          <Input
            placeholder={customPlaceholder}
            value={String(param.value)}
            onChange={(e) => onValueChange(index, e.target.value)}
            sx={{ flex: 1 }}
            disabled={isSubmitting}
          />
        ) : (
          <Select
            value={String(param.value)}
            onChange={(_, value) => onValueChange(index, value)}
            placeholder={placeholder}
            sx={{ flex: 1 }}
            disabled={isSubmitting}
          >
            {items.map((item: any) => (
              <Option key={item[optionKey]} value={item[optionKey]}>
                {item[optionKey]}
              </Option>
            ))}
          </Select>
        )}
        <Stack direction="row" spacing={1} alignItems="center">
          <Checkbox
            checked={isCustomModelDataset}
            onChange={(e) =>
              onToggleCustomModelDataset(index, e.target.checked)
            }
            size="sm"
            disabled={isSubmitting}
          />
          <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
            Enter any string
          </Typography>
        </Stack>
      </Stack>
    );
  }

  if (
    (type === 'int' ||
      type === 'integer' ||
      type === 'float' ||
      type === 'number') &&
    (uiWidget === 'slider' || uiWidget === 'range')
  ) {
    const min = schema?.min ?? 0;
    const max = schema?.max ?? 100;
    const step =
      schema?.step ?? (type === 'int' || type === 'integer' ? 1 : 0.01);

    return (
      <Stack direction="column" spacing={1} sx={{ flex: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Slider
            value={Number(param.value) || min}
            onChange={(_, value) => onValueChangeWithValidate(index, value)}
            min={min}
            max={max}
            step={step}
            valueLabelDisplay="auto"
            sx={{ flex: 1 }}
            disabled={isSubmitting}
          />
          <Input
            value={param.value}
            onChange={(e) => {
              const val = e.target.value;
              onValueChangeWithValidate(index, val === '' ? min : Number(val));
            }}
            type="number"
            slotProps={{ input: { min, max, step } }}
            sx={{ width: 100 }}
            error={!!validationError}
            disabled={isSubmitting}
          />
        </Stack>
        {validationError && (
          <FormHelperText sx={{ color: 'danger.400' }}>
            {validationError}
          </FormHelperText>
        )}
      </Stack>
    );
  }

  if (
    (type === 'bool' || type === 'boolean') &&
    (uiWidget === 'switch' || !uiWidget)
  ) {
    return (
      <Switch
        checked={Boolean(param.value)}
        onChange={(e) => onValueChange(index, e.target.checked)}
        disabled={isSubmitting}
      />
    );
  }

  if (type === 'enum' || schema?.options || schema?.enum) {
    const options = schema?.options || schema?.enum || [];

    if (uiWidget === 'radio') {
      return (
        <RadioGroup
          value={String(param.value)}
          onChange={(e) => onValueChange(index, e.target.value)}
        >
          <Stack direction="row" spacing={2}>
            {options.map((option) => (
              <Radio
                key={option}
                value={option}
                label={option}
                disabled={isSubmitting}
              />
            ))}
          </Stack>
        </RadioGroup>
      );
    }

    return (
      <Select
        value={String(param.value)}
        onChange={(_, value) => onValueChange(index, value)}
        sx={{ flex: 1 }}
        disabled={isSubmitting}
      >
        {options.map((option) => (
          <Option key={option} value={option}>
            {option}
          </Option>
        ))}
      </Select>
    );
  }

  if (
    type === 'int' ||
    type === 'integer' ||
    type === 'float' ||
    type === 'number'
  ) {
    const min = schema?.min;
    const max = schema?.max;
    const step =
      schema?.step ?? (type === 'int' || type === 'integer' ? 1 : 0.00001);

    return (
      <Stack direction="column" spacing={1} sx={{ flex: 1 }}>
        <Input
          type="number"
          value={param.value}
          onChange={(e) => {
            const val = e.target.value;
            onValueChangeWithValidate(index, val === '' ? '' : Number(val));
          }}
          slotProps={{ input: { min, max, step } }}
          sx={{ flex: 1 }}
          error={!!validationError}
          disabled={isSubmitting}
        />
        {validationError && (
          <FormHelperText sx={{ color: 'danger.400' }}>
            {validationError}
          </FormHelperText>
        )}
      </Stack>
    );
  }

  if (type === 'string' && uiWidget === 'password') {
    return (
      <Input
        type="password"
        value={String(param.value)}
        onChange={(e) => onValueChange(index, e.target.value)}
        sx={{ flex: 1 }}
        disabled={isSubmitting}
      />
    );
  }

  if (
    !param.isShorthand &&
    (Array.isArray(param.value) ||
      (typeof param.value === 'object' && param.value !== null))
  ) {
    return (
      <Editor
        height="120px"
        defaultLanguage="json"
        value={JSON.stringify(param.value, null, 2)}
        onChange={(value) => {
          try {
            onValueChange(index, value ? JSON.parse(value) : null);
          } catch {
            // Keep the previous value if parsing fails
          }
        }}
        theme="my-theme"
        onMount={setTheme}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: 'off',
          wordWrap: 'on',
          readOnly: isSubmitting,
        }}
      />
    );
  }

  return (
    <Input
      placeholder="Value (e.g., 0.001, true, false, or any string)"
      value={String(param.value)}
      onChange={(e) => onValueChange(index, e.target.value)}
      sx={{ flex: 1 }}
      disabled={isSubmitting}
    />
  );
}
