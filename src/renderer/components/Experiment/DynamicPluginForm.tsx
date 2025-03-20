/* eslint-disable jsx-a11y/anchor-is-valid */

/* This component renders a dynamic form for a plugin
 * The plugin has two fields, parameters and parameters_ui
 * and these fields map to React JSON Schema Form fields.
 *
 * Here we also create a few custom widgets and templates
 * using the tools offered by JSON Schema Form
 */

import * as React from 'react';

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
import { useMemo } from 'react';
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
  F extends FormContextType = any
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
    multiple
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
  F extends FormContextType = any
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
    multiple
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


function CustomAutocompleteWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: WidgetProps<T, S, F>
) {
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
  const { enumOptions } = options;

  // Default multiple is true.
  // const _multiple = typeof multiple === 'undefined' ? true : !!multiple;
    // Check both multiple and options.multiple; default is true.
    // console.log("OPTIONS", options);
    const _multiple =
    typeof multiple !== 'undefined'
      ? Boolean(multiple)
      : typeof options.multiple !== 'undefined'
      ? Boolean(options.multiple)
      : true;

  // console.log("multiple", _multiple);
  // Determine default value.
  const defaultValue = _multiple ? [] : '';
  // Use the provided value or fallback to default.
  let currentValue = value !== undefined ? value : defaultValue;

  // Check if currentValue is an array, if a string, convert it to an array.
  const isString = typeof currentValue === 'string';
  if (isString) {
    currentValue = currentValue.split(',');
  }

  // Map enumOptions into objects with label and value.
  const processedOptionsValues = enumOptions.map((opt) =>
    typeof opt === 'object' ? opt.value : opt
  );
  // Create processedOptions array as an array of all values in enumOptions

  return (
    <>
      <Autocomplete
        multiple={_multiple}
        id={id}
        placeholder={schema.title || ''}
        options={processedOptionsValues}
        getOptionLabel={(option) => option}
        value={currentValue}
        onChange={(event, newValue) => {
          onChange(newValue);
        }}
        disabled={disabled || readonly}
        autoFocus={autofocus}
      />
      {/* Hidden input to capture the value on form submission */}
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
  ModelProviderWidget: ModelProviderWidget,
  GEvalTasksWidget: GEvalTasksWidget
};

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DynamicPluginForm({
  experimentInfo,
  plugin,
  config,
}: {
  experimentInfo: any;
  plugin: string;
  config?: any; //Config should be optional in case there was no necessary config
}) {
  const { data, error, isLoading, mutate } = useSWR(
    experimentInfo?.id &&
      plugin &&
      chatAPI.Endpoints.Experiment.ScriptGetFile(
        experimentInfo?.id,
        plugin,
        'index.json'
      ),
    fetcher
  );
  const [configData, setConfigData] = React.useState<any>(null);
  //Using use effect here to update the config data when the data or config changes
  React.useEffect(() => {
    if (config && data) {
      let parsedData;
      try {
        parsedData = JSON.parse(data); //Parsing data for easy access to parameters}
      } catch (e) {
        console.error('Error parsing data', e);
        parsedData = '';
      }
      //Iterating through the config object and updating the default values in the data
      Object.keys(config).forEach((key) => {
        if (
          parsedData &&
          parsedData.parameters &&
          key in parsedData.parameters
        ) {
        //   if (parsedData.parameters[key].enum) {
        //   // Set the enum array such that config[key] is the first element
        //   const enumArray = parsedData.parameters[key].enum;
        //   let index = enumArray.indexOf(config[key]);
        //   if (index > 0) {
        //     enumArray.unshift(enumArray.splice(index, 1)[0]);
        //   }
        //   parsedData.parameters[key].enum = enumArray;
        // }
        parsedData.parameters[key].default = config[key];
        }
      });
      // Delete all keys in parsedData.parameters that start with tflabcustomui_
      Object.keys(parsedData.parameters).forEach((key) => {
        if (key.startsWith('tflabcustomui_')) {
          delete parsedData.parameters[key];
        }
      });
      // if key is in parsedData.parameters but not in config then delete the key from parsedData.parameters
      //Schema takes in data as a JSON string
      setConfigData(JSON.stringify(parsedData));
    } else if (data) {
      setConfigData(data); //Setting the config data to the data if there is no config
    }
  }, [plugin, experimentInfo, config, data]);

  const schema = useMemo(() => getSchema(configData), [configData]);
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
        <Form
          tagName="div"
          className="pure-form pure-form-stacked dynamic-plugin-form"
          schema={schema?.JSONSchema}
          uiSchema={schema?.uiSchema}
          validator={validator}
          children={true} // removes submit button
          idPrefix=""
          idSeparator=""
          id="plugin_parameters"
          templates={{ FieldTemplate: CustomFieldTemplate, BaseInputTemplate }}
          widgets={{ ...widgets }}
        />
      ) : (
        <div>&nbsp;</div>
      )}
    </>
  );
}
