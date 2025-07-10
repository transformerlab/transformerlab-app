/* eslint-disable jsx-a11y/anchor-is-valid */

/* This component renders a dynamic form for a plugin
 * The plugin has two fields, parameters and parameters_ui
 * and these fields map to React JSON Schema Form fields.
 *
 * Here we also create a few custom widgets and templates
 * using the tools offered by JSON Schema Form
 */

import * as React from 'react';
import { ChangeEvent, FocusEvent, useMemo } from 'react';

import validator from '@rjsf/validator-ajv8';
import Form from '@rjsf/core';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import {
  FormControl,
  FormLabel,
  Input,
  Select,
  Slider,
  Stack,
  Option,
  Autocomplete,
} from '@mui/joy';
import ModelProviderWidget from 'renderer/components/Experiment/Widgets/ModelProviderWidget';
import CustomEvaluationWidget from './Widgets/CustomEvaluationWidget';
import GEvalTasksWidget from './Widgets/CustomGEvalWidget';

import {
  RegistryWidgetsType,
  getInputProps,
  BaseInputTemplateProps,
  ariaDescribedByIds,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
  rangeSpec,
  FieldTemplateProps,
  enumOptionsValueForIndex,
  enumOptionsIndexForValue,
} from '@rjsf/utils';

const schemaTemplate: RJSFSchema = {
  type: 'object',
  required: [],
  properties: {},
};

function BaseInputTemplate(props: BaseInputTemplateProps) {
  const {
    schema,
    id,
    options,
    label,
    value,
    type,
    placeholder,
    required,
    disabled,
    readonly,
    autofocus,
    onChange,
    onChangeOverride,
    onBlur,
    onFocus,
    rawErrors,
    hideError,
    uiSchema,
    registry,
    formContext,
    ...rest
  } = props;
  const onTextChange = ({
    target: { value: val },
  }: ChangeEvent<HTMLInputElement>) => {
    // Use the options.emptyValue if it is specified and newVal is also an empty string
    onChange(val === '' ? options.emptyValue || '' : val);
  };
  const onTextBlur = ({
    target: { value: val },
  }: FocusEvent<HTMLInputElement>) => onBlur(id, val);
  const onTextFocus = ({
    target: { value: val },
  }: FocusEvent<HTMLInputElement>) => onFocus(id, val);

  const inputProps = { ...rest, ...getInputProps(schema, type, options) };
  const hasError = rawErrors?.length > 0 && !hideError;

  const { step, min, max } = inputProps;

  return (
    <Input
      id={id}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      readOnly={readonly}
      autoFocus={autofocus}
      error={hasError}
      onChange={onChangeOverride || onTextChange}
      onBlur={onTextBlur}
      onFocus={onTextFocus}
      {...inputProps}
      slotProps={{ input: { step, min, max } }}
    />
  );
}

function getSchema(data) {
  if (data) {
    let parsedData = JSON.parse(data);
    let schemaParameters = parsedData.parameters;
    let requiredParameters = [];
    for (let key in schemaParameters) {
      if (schemaParameters[key]?.required) {
        requiredParameters.push(key);
      }
    }
    let newSchemaTemplate = { ...schemaTemplate };
    newSchemaTemplate.properties = schemaParameters;
    newSchemaTemplate.required = requiredParameters;
    const uiSchema = parsedData.parameters_ui;
    return { JSONSchema: newSchemaTemplate, uiSchema: uiSchema };
  }
  return { JSONSchema: schemaTemplate, uiSchema: {} };
}

const CustomRange = function (props: WidgetProps) {
  const {
    value,
    readonly,
    disabled,
    onBlur,
    onFocus,
    options,
    schema,
    onChange,
    required,
    label,
    hideLabel,
    id,
  } = props;
  const sliderProps = { value, label, id, name: id, ...rangeSpec<S>(schema) };
  const _onChange = (_: any, value?: number | number[]) => {
    onChange(value ?? options.emptyValue);
  };
  const _onBlur = ({ target: { value } }: FocusEvent<HTMLInputElement>) =>
    onBlur(id, value);
  const _onFocus = ({ target: { value } }: FocusEvent<HTMLInputElement>) =>
    onFocus(id, value);

  return (
    <>
      {/* {labelValue(
        <FormLabel required={required} htmlFor={id}>
          {label || undefined}
        </FormLabel>,
        hideLabel
      )} */}
      &nbsp;({value})
      <Stack direction="row">
        <Slider
          disabled={disabled || readonly}
          required={required}
          onChange={_onChange}
          onBlur={_onBlur}
          onFocus={_onFocus}
          valueLabelDisplay="auto"
          {...sliderProps}
          aria-describedby={ariaDescribedByIds<T>(id)}
        />
      </Stack>
    </>
  );
};

/** Copied from here https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/mui/src/SelectWidget/SelectWidget.tsx */
function CustomSelect<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>({
  schema,
  id,
  name, // remove this from textFieldProps
  options,
  label,
  hideLabel,
  required,
  disabled,
  placeholder,
  readonly,
  value,
  multiple,
  autofocus,
  onChange,
  onBlur,
  onFocus,
  rawErrors = [],
  registry,
  uiSchema,
  hideError,
  formContext,
  ...textFieldProps
}: WidgetProps<T, S, F>) {
  const { enumOptions, enumDisabled, emptyValue: optEmptyVal } = options;

  multiple = typeof multiple === 'undefined' ? false : !!multiple;

  const emptyValue = multiple ? [] : '';
  const isEmpty =
    typeof value === 'undefined' ||
    (multiple && value.length < 1) ||
    (!multiple && value === emptyValue);

  const _onChange = ({ target: { value } }: ChangeEvent<{ value: string }>) =>
    onChange(enumOptionsValueForIndex<S>(value, enumOptions, optEmptyVal));
  const _onBlur = ({ target: { value } }: FocusEvent<HTMLInputElement>) =>
    onBlur(id, enumOptionsValueForIndex<S>(value, enumOptions, optEmptyVal));
  const _onFocus = ({ target: { value } }: FocusEvent<HTMLInputElement>) =>
    onFocus(id, enumOptionsValueForIndex<S>(value, enumOptions, optEmptyVal));
  const selectedIndexes = enumOptionsIndexForValue<S>(
    value,
    enumOptions,
    multiple,
  );

  // set a default value for the field if it's not multi-select and value is set
  const defaultValue = !isEmpty && !multiple ? value : emptyValue;

  return (
    <>
      {/* <Input
        id={id}
        name={id}
        label={labelValue(label || undefined, hideLabel, undefined)}
        value={
          !isEmpty && typeof selectedIndexes !== 'undefined'
            ? selectedIndexes
            : emptyValue
        }
        required={required}
        disabled={disabled || readonly}
        autoFocus={autofocus}
        placeholder={placeholder}
        error={rawErrors.length > 0}
        onChange={_onChange}
        onBlur={_onBlur}
        onFocus={_onFocus}
        {...(textFieldProps as TextFieldProps)}
        select // Apply this and the following props after the potential overrides defined in textFieldProps
        InputLabelProps={{
          ...textFieldProps.InputLabelProps,
          shrink: !isEmpty,
        }}
        SelectProps={{
          ...textFieldProps.SelectProps,
          multiple,
        }}
        aria-describedby={ariaDescribedByIds<T>(id)}
      >
        {' '}
      </Input> */}
      <Select
        name={id}
        id={id}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        defaultValue={String(defaultValue)}
      >
        {Array.isArray(enumOptions) &&
          enumOptions.map(({ value, label }, i: number) => {
            const disabled: boolean =
              Array.isArray(enumDisabled) && enumDisabled.indexOf(value) !== -1;

            // selectedIndexes is an array if multiple is set, or an integer (or undefined) if not multiple
            const selected: boolean = multiple
              ? Array.isArray(selectedIndexes) &&
                selectedIndexes.indexOf(i) !== -1
              : i == selectedIndexes;
            return (
              <Option
                key={i}
                value={String(label)}
                disabled={disabled}
                label={label}
              >
                {label}
              </Option>
            );
          })}
      </Select>
    </>
  );
}

/* Below I create a simpler version of customselect that doesn't use MUI. We do this because for VERY VERY large option lists, MUI chokes.
This is more performant but less nice looking */
function CustomSelectSimple<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>({
  schema,
  id,
  name, // remove this from textFieldProps
  options,
  label,
  hideLabel,
  required,
  disabled,
  placeholder,
  readonly,
  value,
  multiple,
  autofocus,
  onChange,
  onBlur,
  onFocus,
  rawErrors = [],
  registry,
  uiSchema,
  hideError,
  formContext,
  ...textFieldProps
}: WidgetProps<T, S, F>) {
  const { enumOptions, enumDisabled, emptyValue: optEmptyVal } = options;

  multiple = typeof multiple === 'undefined' ? false : !!multiple;

  const emptyValue = multiple ? [] : '';
  const isEmpty =
    typeof value === 'undefined' ||
    (multiple && value.length < 1) ||
    (!multiple && value === emptyValue);

  const _onChange = ({ target: { value } }: ChangeEvent<{ value: string }>) =>
    onChange(enumOptionsValueForIndex<S>(value, enumOptions, optEmptyVal));
  const _onBlur = ({ target: { value } }: FocusEvent<HTMLInputElement>) =>
    onBlur(id, enumOptionsValueForIndex<S>(value, enumOptions, optEmptyVal));
  const _onFocus = ({ target: { value } }: FocusEvent<HTMLInputElement>) =>
    onFocus(id, enumOptionsValueForIndex<S>(value, enumOptions, optEmptyVal));
  const selectedIndexes = enumOptionsIndexForValue<S>(
    value,
    enumOptions,
    multiple,
  );

  // set a default value for the field if it's not multi-select and value is set
  const defaultValue = !isEmpty && !multiple ? value : emptyValue;

  return (
    <>
      <select
        name={id}
        id={id}
        required={required}
        disabled={disabled}
        defaultValue={String(defaultValue)}
      >
        {Array.isArray(enumOptions) &&
          enumOptions.map(({ value, label }, i: number) => {
            const disabled: boolean =
              Array.isArray(enumDisabled) && enumDisabled.indexOf(value) !== -1;

            // selectedIndexes is an array if multiple is set, or an integer (or undefined) if not multiple
            const selected: boolean = multiple
              ? Array.isArray(selectedIndexes) &&
                selectedIndexes.indexOf(i) !== -1
              : i == selectedIndexes;
            return (
              <option
                key={i}
                value={String(label)}
                disabled={disabled}
                label={label}
              >
                {label}
              </option>
            );
          })}
      </select>
    </>
  );
}

function CustomAutocompleteWidget<
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
  const { enumOptions, emptyValue } = options;

  // Check both multiple and options.multiple; default is true for autocomplete
  // Most autocomplete fields in evaluations are multiple selection
  let isMultiple = true;
  if (typeof multiple !== 'undefined') {
    isMultiple = Boolean(multiple);
  } else if (typeof options.multiple !== 'undefined') {
    isMultiple = Boolean(options.multiple);
  }

  // Determine appropriate empty value based on multiple selection
  const defaultEmptyValue = isMultiple ? [] : '';
  const actualEmptyValue =
    emptyValue !== undefined ? emptyValue : defaultEmptyValue;

  // Process current value properly - this is key for handling EvalModal config values
  let currentValue = value;

  // Handle undefined/null values
  if (currentValue === undefined || currentValue === null) {
    currentValue = actualEmptyValue;
  }

  // For multiple selection, ensure we have an array
  if (isMultiple) {
    if (typeof currentValue === 'string') {
      // Split comma-separated string into array, but handle empty strings
      // This handles values coming from EvalModal config like "task1,task2,task3"
      currentValue =
        currentValue === ''
          ? []
          : currentValue
              .split(',')
              .map((item) => item.trim())
              .filter((item) => item !== '');
    } else if (!Array.isArray(currentValue)) {
      // Convert single values to arrays for multiple selection
      currentValue = currentValue ? [currentValue] : [];
    }
    // Ensure we have a clean array with no empty values
    currentValue = currentValue.filter(
      (item: any) => item !== null && item !== undefined && item !== '',
    );
  } else {
    // For single selection, ensure we have a string
    if (Array.isArray(currentValue)) {
      currentValue = currentValue.length > 0 ? currentValue[0] : '';
    }
    currentValue = currentValue || '';
  }

  // Map enumOptions into simple values
  const processedOptionsValues =
    enumOptions?.map((opt) => (typeof opt === 'object' ? opt.value : opt)) ||
    [];

  const handleChange = (event: any, newValue: any) => {
    // Handle clearing/empty values properly - this is key for fixing the deletion issue
    if (newValue === null || newValue === undefined) {
      onChange(actualEmptyValue);
      return;
    }

    // For multiple selection
    if (isMultiple) {
      let processedValue = newValue;
      if (!Array.isArray(processedValue)) {
        processedValue = processedValue ? [processedValue] : [];
      }
      // Filter out empty values
      processedValue = processedValue.filter(
        (item: any) => item !== null && item !== undefined && item !== '',
      );

      // Always allow clearing to empty array/value even if originally had values
      if (processedValue.length === 0) {
        onChange(actualEmptyValue);
      } else {
        onChange(processedValue);
      }
    } else {
      // For single selection - allow clearing to empty value
      onChange(newValue === '' ? actualEmptyValue : newValue);
    }
  };

  return (
    <Autocomplete
      multiple={isMultiple}
      id={id}
      placeholder={schema.title || ''}
      options={processedOptionsValues}
      getOptionLabel={(option) => String(option || '')}
      value={currentValue}
      onChange={handleChange}
      disabled={disabled || readonly}
      autoFocus={autofocus}
      // Enable clearing functionality
      clearOnEscape
      blurOnSelect={!isMultiple}
      // Allow free input and clearing
      freeSolo={false}
      // Ensure proper value comparison for clearing to work
      isOptionEqualToValue={(option, val) => String(option) === String(val)}
      // Add clear icon
      clearIcon
    />
  );
}

function CustomFieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    classNames,
    style,
    label,
    help,
    required,
    description,
    errors,
    children,
  } = props;
  return (
    <div className={classNames} style={style}>
      <FormControl>
        <FormLabel htmlFor={id}>
          {label}
          {required ? '*' : null}
        </FormLabel>
        {description}
        {children}
        <small>{help}</small>
        {errors}
      </FormControl>
    </div>
  );
}

const widgets: RegistryWidgetsType = {
  RangeWidget: CustomRange,
  SelectWidget: CustomSelectSimple,
  AutoCompleteWidget: CustomAutocompleteWidget,
  EvaluationWidget: CustomEvaluationWidget,
  ModelProviderWidget,
  GEvalTasksWidget,
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DynamicPluginForm({
  experimentInfo,
  plugin,
  config,
}: {
  experimentInfo: any;
  plugin: string;
  config?: any; // Config should be optional in case there was no necessary config
}) {
  const { data, error, isLoading, mutate } = useSWR(
    experimentInfo?.id &&
      plugin &&
      chatAPI.Endpoints.Experiment.ScriptGetFile(
        experimentInfo?.id,
        plugin,
        'index.json',
      ),
    fetcher,
  );
  const [configData, setConfigData] = React.useState<any>(null);
  const [formData, setFormData] = React.useState<any>(config || {});

  // Using use effect here to update the config data when the data or config changes
  // Check for 'FILE NOT FOUND' and set safeData accordingly
  const safeData = data === 'FILE NOT FOUND' ? null : data;

  React.useEffect(() => {
    if (config && safeData) {
      let parsedData;
      try {
        parsedData = JSON.parse(safeData); // Parsing data for easy access to parameters
      } catch (e) {
        console.error('Error parsing data', e);
        parsedData = '';
      }

      // Don't modify the schema defaults - keep them intact
      // The config values will be passed as formData instead

      // Delete all keys in parsedData.parameters that start with tflabcustomui_
      Object.keys(parsedData.parameters).forEach((key) => {
        if (key.startsWith('tflabcustomui_')) {
          delete parsedData.parameters[key];
        }
      });

      // Schema takes in data as a JSON string
      setConfigData(JSON.stringify(parsedData));
    } else if (safeData) {
      setConfigData(safeData); // Setting the config data to the data if there is no config
    } else {
      setConfigData(null);
    }
  }, [plugin, experimentInfo, config, safeData]);

  // Update formData when config changes
  React.useEffect(() => {
    setFormData(config || {});
  }, [config]);

  const schema = useMemo(() => getSchema(configData), [configData]);

  const handleFormChange = (formChangeData: any) => {
    setFormData(formChangeData.formData);

    // Expose the current form data so parent components can access it
    // This is important for saving the form data
    if (window && typeof window === 'object') {
      (window as any).currentFormData = formChangeData.formData;
    }
  };

  // Generate hidden inputs for each form field so they get picked up by parent form
  const renderHiddenInputs = () => {
    if (!formData) return null;

    return Object.keys(formData).map((key) => {
      const value = formData[key];
      let hiddenValue = value;

      // Handle array values
      if (Array.isArray(value)) {
        // Check if array contains objects (like from GEvalTasksWidget)
        if (
          value.length > 0 &&
          typeof value[0] === 'object' &&
          value[0] !== null
        ) {
          // Serialize objects as JSON
          hiddenValue = JSON.stringify(value);
        } else {
          // For simple arrays (like from autocomplete) - convert to comma-separated string
          hiddenValue = value.join(',');
        }
      }

      return (
        <input
          key={key}
          type="hidden"
          name={key}
          value={hiddenValue || ''}
          readOnly
        />
      );
    });
  };

  /* Below we wait for "configData" to be sure that defaults are set before rendering
  if we don't do this, then the form is rendered twice and Select elements will not
  honour the second settings for default Value */
  return (
    <>
      {/* <Typography level="title-sm">
        Custom Fields from Plugin: {plugin}
      </Typography> */}
      {/* <pre>{JSON.stringify(schema, null, 2)}</pre> */}
      {plugin && configData ? (
        <>
          <Form
            tagName="div"
            className="pure-form pure-form-stacked dynamic-plugin-form"
            schema={schema?.JSONSchema}
            uiSchema={schema?.uiSchema}
            formData={formData}
            onChange={handleFormChange}
            validator={validator}
            idPrefix=""
            idSeparator=""
            id="plugin_parameters"
            templates={{
              FieldTemplate: CustomFieldTemplate,
              BaseInputTemplate,
            }}
            widgets={{ ...widgets }}
            noHtml5Validate
            showErrorList={false}
          >
            <div style={{ display: 'none' }} />
          </Form>
          {/* Hidden inputs to make form data available to parent form */}
          {renderHiddenInputs()}
        </>
      ) : (
        <div>&nbsp;</div>
      )}
    </>
  );
}
