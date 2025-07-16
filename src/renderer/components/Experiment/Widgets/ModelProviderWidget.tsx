import * as React from 'react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { Autocomplete } from '@mui/joy';
import {
  WidgetProps,
  RJSFSchema,
  StrictRJSFSchema,
  FormContextType,
} from '@rjsf/utils';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

function ModelProviderWidget<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: WidgetProps<T, S, F>) {
  const {
    id,
    value,
    disabled,
    readonly,
    autofocus,
    onChange,
    options,
    schema,
    multiple,
  } = props;

  // Determine multiple, defaulting to true.
  const isMultiple = React.useMemo(() => {
    if (typeof multiple !== 'undefined') {
      return Boolean(multiple);
    }
    if (typeof options.multiple !== 'undefined') {
      return Boolean(options.multiple);
    }
    return true;
  }, [multiple, options.multiple]);

  // Disabled API key mapping.
  const isDisabledFilter = true;
  const disabledEnvMap: Record<string, string> = {
    claude: 'ANTHROPIC_API_KEY',
    azure: 'AZURE_OPENAI_DETAILS',
    openai: 'OPENAI_API_KEY',
    custom: 'CUSTOM_MODEL_API_KEY',
  };
  const configKeysInOrder = Object.values(disabledEnvMap);
  const [configValues, setConfigValues] = React.useState<Record<string, any>>(
    {},
  );
  const [selectedInferenceEngine, setSelectedInferenceEngine] =
    React.useState<string>('');

  // Set default/current value.
  const defaultValue = isMultiple ? [] : '';
  const currentValue = value !== undefined ? value : defaultValue;

  // Check if Local is selected (memoized to prevent unnecessary recalculations)
  const isLocalSelected = React.useMemo(() => {
    // Helper function to parse values
    const parseValue = (val: string) => {
      try {
        const parsed = JSON.parse(val);
        return parsed.provider || val;
      } catch {
        return val;
      }
    };

    // Handle empty or undefined values
    if (!currentValue) return false;

    if (isMultiple) {
      if (Array.isArray(currentValue)) {
        return currentValue.some((val) => parseValue(val) === 'local');
      }
      return false;
    }
    return parseValue(currentValue) === 'local';
  }, [currentValue, isMultiple]);

  // Get experiment ID from context or form context
  const { experimentInfo: contextExperimentInfo } = useExperimentInfo();

  const experimentId = React.useMemo(() => {
    // Try context first
    if (contextExperimentInfo?.id) {
      return contextExperimentInfo.id;
    }

    // Fallback to form context
    if (options?.formContext && typeof options.formContext === 'object') {
      return (options.formContext as any)?.experimentId;
    }

    return undefined;
  }, [contextExperimentInfo, options]);

  // Memoize API parameters to prevent unnecessary re-calls
  const apiParams = React.useMemo(
    () => ({
      experimentId,
      type: 'loader' as const,
    }),
    [experimentId],
  );

  const apiOptions = React.useMemo(
    () => ({
      skip: !isLocalSelected || !experimentId,
    }),
    [isLocalSelected, experimentId],
  );

  // Fetch loader plugins when Local is selected
  const { data: loaderPlugins } = chatAPI.useAPI(
    'experiment',
    ['getScriptsOfTypeWithoutFilter'],
    apiParams,
    apiOptions,
  );

  // console.log('Loader plugins:', loaderPlugins);
  // console.log('Experiment ID:', experimentId);

  React.useEffect(() => {
    const fetchConfigValues = async () => {
      const configResults = await Promise.all(
        configKeysInOrder.map(async (key) => {
          const response = await fetch(
            chatAPI.getAPIFullPath('config', ['get'], { key }),
          );
          if (!response.ok) {
            // console.error(`Failed to fetch config for key: ${key}`);
            return null;
          }
          return response.json();
        }),
      );
      // console.log('Config results:', configResults);
      const values: Record<string, any> = {};
      configKeysInOrder.forEach((key, idx) => {
        values[key] = configResults[idx];
      });
      setConfigValues(values);
    };

    fetchConfigValues();
  }, [configKeysInOrder]);

  // Initialize selectedInferenceEngine from existing value
  React.useEffect(() => {
    if (isLocalSelected && currentValue) {
      const parseValue = (val: string) => {
        try {
          const parsed = JSON.parse(val);
          return parsed.model_server || '';
        } catch {
          return '';
        }
      };

      if (isMultiple && Array.isArray(currentValue)) {
        const localValue = currentValue.find((val) => {
          try {
            const parsed = JSON.parse(val);
            return parsed.provider === 'local';
          } catch {
            return val === 'local';
          }
        });
        if (localValue) {
          const modelServer = parseValue(localValue);
          if (modelServer && modelServer !== selectedInferenceEngine) {
            setSelectedInferenceEngine(modelServer);
          }
        }
      } else if (!isMultiple) {
        const modelServer = parseValue(currentValue);
        if (modelServer && modelServer !== selectedInferenceEngine) {
          setSelectedInferenceEngine(modelServer);
        }
      }
    }
  }, [isLocalSelected, currentValue, isMultiple, selectedInferenceEngine]);

  // Map: label => stored value.
  const labelToCustomValue: Record<string, string> = {
    'Claude Opus 4': 'claude-opus-4-20250514',
    'Claude Sonnet 4': 'claude-sonnet-4-20250514',
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

  // Convert stored value(s) to display labels.
  const displayValue = React.useMemo(() => {
    const parseValue = (val: string) => {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(val);
        return parsed.provider || val;
      } catch {
        // If not JSON, return as-is
        return val;
      }
    };

    if (isMultiple) {
      if (Array.isArray(currentValue)) {
        return currentValue.map((val) => {
          const provider = parseValue(val);
          return customValueToLabel[provider] || provider;
        });
      }
      return [];
    }
    const provider = parseValue(currentValue);
    return customValueToLabel[provider] || provider;
  }, [isMultiple, currentValue, customValueToLabel]);

  // Build disabled mapping for options.
  const combinedOptions = optionsList.reduce(
    (acc: Record<string, { disabled: boolean; info?: string }>, opt) => {
      const lower = opt.toLowerCase();
      let optDisabled = false;
      let infoMessage = '';
      if (isDisabledFilter) {
        const matchingEnvKey = Object.keys(disabledEnvMap).find((envKey) =>
          lower.startsWith(envKey),
        );
        if (matchingEnvKey) {
          const configKey = disabledEnvMap[matchingEnvKey];
          const configVal = configValues[configKey];
          optDisabled = !configVal || configVal === '';
          if (optDisabled) {
            infoMessage = `Please set ${configKey} in settings`;
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
        multiple={isMultiple}
        id={id}
        placeholder={schema.title || ''}
        options={optionsList}
        getOptionLabel={(option) =>
          option +
          (combinedOptions[option]?.disabled
            ? ` - ${combinedOptions[option].info}`
            : '')
        }
        getOptionDisabled={(option) =>
          combinedOptions[option]?.disabled ?? false
        }
        value={displayValue}
        onChange={(event, newValue) => {
          const storedValue = isMultiple
            ? newValue.map(
                (label: string) => labelToCustomValue[label] || label,
              )
            : labelToCustomValue[newValue] || newValue;

          const hasLocal = isMultiple
            ? Array.isArray(storedValue) &&
              storedValue.some((val) => val === 'local')
            : storedValue === 'local';

          if (!hasLocal) {
            // Clear inference engine selection when Local is deselected
            setSelectedInferenceEngine('');
          }

          // Convert all providers to JSON format for consistency
          let jsonValue;
          if (isMultiple) {
            if (Array.isArray(storedValue)) {
              jsonValue = storedValue.map((val) =>
                JSON.stringify({ provider: val }),
              );
            } else {
              jsonValue = [JSON.stringify({ provider: storedValue })];
            }
          } else {
            jsonValue = JSON.stringify({ provider: storedValue });
          }

          onChange(jsonValue);
        }}
        disabled={disabled || readonly}
        autoFocus={autofocus}
      />

      {/* Inference Engine Selection - only show when Local is selected */}
      {isLocalSelected && (
        <Autocomplete
          id={`${id}_inference_engine`}
          placeholder="Select Inference Engine"
          options={loaderPlugins?.map((plugin: any) => plugin.uniqueId) || []}
          getOptionLabel={(option) => {
            const plugin = loaderPlugins?.find(
              (p: any) => p.uniqueId === option,
            );
            return plugin?.name || option;
          }}
          value={selectedInferenceEngine}
          onChange={(event, newValue) => {
            setSelectedInferenceEngine(newValue || '');

            // Update the JSON objects to include model_server for local providers
            if (newValue) {
              let updatedValue;
              if (isMultiple) {
                if (Array.isArray(currentValue)) {
                  updatedValue = currentValue.map((val) => {
                    try {
                      const parsed = JSON.parse(val);
                      if (parsed.provider === 'local') {
                        return JSON.stringify({
                          provider: 'local',
                          model_server: newValue,
                        });
                      }
                      return val;
                    } catch {
                      // If not JSON, check if it's 'local' string
                      if (val === 'local') {
                        return JSON.stringify({
                          provider: 'local',
                          model_server: newValue,
                        });
                      }
                      return val;
                    }
                  });
                } else {
                  updatedValue = [
                    JSON.stringify({
                      provider: 'local',
                      model_server: newValue,
                    }),
                  ];
                }
              } else {
                updatedValue = JSON.stringify({
                  provider: 'local',
                  model_server: newValue,
                });
              }

              onChange(updatedValue);
            }
          }}
          disabled={disabled || readonly}
          sx={{ mt: 1 }}
        />
      )}

      {/* Hidden input to capture the stored value on form submission */}
      <input
        type="hidden"
        name={id}
        value={(() => {
          if (isMultiple) {
            if (Array.isArray(currentValue)) {
              return currentValue.join(',');
            }
            return currentValue || '';
          }
          return currentValue || '';
        })()}
      />
    </>
  );
}

export default ModelProviderWidget;
