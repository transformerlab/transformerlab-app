import * as React from 'react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { Autocomplete } from '@mui/joy';
import {
  WidgetProps,
  RJSFSchema,
  StrictRJSFSchema,
  FormContextType,
} from '@rjsf/utils';

// Simple fetcher for useSWR.
const fetcher = (url: string) => fetch(url).then((res) => res.json());

function ModelProviderWidget<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: WidgetProps<T, S, F>) {
  const {
    id,
    value,
    required,
    disabled,
    readonly,
    autofocus,
    onChange,
    options,
    schema,
    multiple,
  } = props;

  // Determine multiple, defaulting to true.
  const _multiple =
    typeof multiple !== 'undefined'
      ? Boolean(multiple)
      : typeof options.multiple !== 'undefined'
        ? Boolean(options.multiple)
        : true;

  // Disabled API key mapping.
  const isDisabledFilter = true;
  const disabledEnvMap = {
    claude: 'ANTHROPIC_API_KEY',
    azure: 'AZURE_OPENAI_DETAILS',
    openai: 'OPENAI_API_KEY',
    custom: 'CUSTOM_MODEL_API_KEY',
  };
  const configKeysInOrder = Object.values(disabledEnvMap);
  const configResults = configKeysInOrder.map((key) =>
    useSWR(chatAPI.Endpoints.Config.Get(key), fetcher),
  );
  const configValues = React.useMemo(() => {
    const values: Record<string, any> = {};
    configKeysInOrder.forEach((key, idx) => {
      values[key] = configResults[idx]?.data;
    });
    return values;
  }, [configKeysInOrder, configResults]);

  // Map: label => stored value.
  const labelToCustomValue: Record<string, string> = {
    'Claude 3.7 Sonnet': 'claude-3-7-sonnet-latest',
    'Claude 3.5 Haiku': 'claude-3-5-haiku-latest',
    'OpenAI GPT 4o': 'gpt-4o',
    'OpenAI GPT 4.1': 'gpt-4.1',
    'OpenAI GPT 4o Mini': 'gpt-4o-mini',
    'OpenAI GPT 4.1 Mini': 'gpt-4.1-mini',
    'OpenAI GPT 4.1 Nano': 'gpt-4.1-nano',
    'Azure OpenAI': 'azure-openai',
    'Custom Model API': 'custom-model-api',
    Local: 'local',
  };

  // Options coming from mapping keys.
  const optionsList = Object.keys(labelToCustomValue);

  // Inverse mapping: stored value => label.
  const customValueToLabel = Object.entries(labelToCustomValue).reduce(
    (acc, [label, custom]) => {
      acc[custom] = label;
      return acc;
    },
    {} as Record<string, string>,
  );

  // Set default/current value.
  const defaultValue = _multiple ? [] : '';
  const currentValue = value !== undefined ? value : defaultValue;

  // Convert stored value(s) to display labels.
  const displayValue = _multiple
    ? Array.isArray(currentValue)
      ? currentValue.map((val) => customValueToLabel[val] || val)
      : []
    : customValueToLabel[currentValue] || currentValue;

  // Build disabled mapping for options.
  const combinedOptions = optionsList.reduce(
    (acc: Record<string, { disabled: boolean; info?: string }>, opt) => {
      const lower = opt.toLowerCase();
      let optDisabled = false;
      let infoMessage = '';
      if (isDisabledFilter) {
        for (const envKey in disabledEnvMap) {
          if (lower.startsWith(envKey)) {
            const configKey = disabledEnvMap[envKey];
            const configVal = configValues[configKey];
            optDisabled = !configVal || configVal === '';
            if (optDisabled) {
              infoMessage = `Please set ${configKey} in settings`;
            }
            break;
          }
        }
      }
      acc[opt] = {
        disabled: optDisabled,
        info: optDisabled ? infoMessage : '',
      };
      return acc;
    },
    {},
  );

  return (
    <>
      <Autocomplete
        multiple={_multiple}
        id={id}
        placeholder={schema.title || ''}
        options={optionsList}
        getOptionLabel={(option) =>
          option +
          (combinedOptions[option]?.disabled
            ? ' - ' + combinedOptions[option].info
            : '')
        }
        getOptionDisabled={(option) =>
          combinedOptions[option]?.disabled ?? false
        }
        value={displayValue}
        onChange={(event, newValue) => {
          const storedValue = _multiple
            ? newValue.map((label) => labelToCustomValue[label] || label)
            : labelToCustomValue[newValue] || newValue;
          onChange(storedValue);
        }}
        disabled={disabled || readonly}
        autoFocus={autofocus}
      />
      {/* Hidden input to capture the stored value on form submission */}
      <input
        type="hidden"
        name={id}
        value={
          _multiple
            ? Array.isArray(currentValue)
              ? currentValue.join(',')
              : currentValue
            : currentValue
        }
      />
    </>
  );
}

export default ModelProviderWidget;
