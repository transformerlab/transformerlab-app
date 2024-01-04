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
  FormHelperText,
  FormLabel,
  Input,
  Slider,
  Stack,
  Typography,
} from '@mui/joy';
import { useMemo } from 'react';

import {
  RegistryWidgetsType,
  getInputProps,
  BaseInputTemplateProps,
  ariaDescribedByIds,
  labelValue,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
  rangeSpec,
  FieldTemplateProps,
} from '@rjsf/utils';

const schemaTemplate: RJSFSchema = {
  type: 'object',
  required: ['title'],
  properties: {
    title: { type: 'string', title: 'Title', default: 'A new task' },
    number: { type: 'integer', title: 'Integer' },
    done: { type: 'boolean', title: 'Done?', default: false },
  },
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
    console.log('Getting new schema from plugin');
    // console.log(data);
    let parsedData = JSON.parse(data);
    let schemaParameters = parsedData.parameters;
    let newSchemaTemplate = { ...schemaTemplate };
    newSchemaTemplate.properties = schemaParameters;
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
        <FormHelperText>{help}</FormHelperText>
        {description}
        {children}
        {errors}
      </FormControl>
    </div>
  );
}

const widgets: RegistryWidgetsType = {
  RangeWidget: CustomRange,
};

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DynamicPluginForm({ experimentInfo, plugin }) {
  const { data, error, isLoading } = useSWR(
    experimentInfo?.id &&
      plugin &&
      chatAPI.Endpoints.Experiment.ScriptGetFile(
        experimentInfo?.id,
        plugin,
        'index.json'
      ),
    fetcher
  );

  const schema = useMemo(() => getSchema(data), [data]);

  return (
    <>
      {/* <Typography level="title-sm">
        Custom Fields from Plugin: {plugin}
      </Typography> */}
      {/* <pre>{JSON.stringify(schema, null, 2)}</pre> */}
      {plugin && data ? (
        <Form
          tagName="div"
          className="pure-form pure-form-stacked"
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
        'No plugin selected...'
      )}
    </>
  );
}
