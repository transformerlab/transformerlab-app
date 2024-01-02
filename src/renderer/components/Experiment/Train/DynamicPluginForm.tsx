/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import Form from '@rjsf/core';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { Input, Typography } from '@mui/joy';
import { useMemo } from 'react';

import { getInputProps, BaseInputTemplateProps } from '@rjsf/utils';

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
    console.log(data);
    let parsedData = JSON.parse(data);
    let schemaParameters = parsedData.parameters;
    let newSchemaTemplate = { ...schemaTemplate };
    newSchemaTemplate.properties = schemaParameters;
    console.log('New schema');
    console.log(newSchemaTemplate);
    return newSchemaTemplate;
  }
  return schemaTemplate;
}

const log = (type) => console.log.bind(console, type);
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
      <Typography level="title-lg">
        Custom Fields from Plugin: {plugin}
      </Typography>
      {/* <pre>{JSON.stringify(getSchema(data), null, 2)}</pre> */}
      {plugin && data ? (
        <Form
          tagName="div"
          className="pure-form pure-form-stacked"
          schema={schema}
          validator={validator}
          children={true} // removes submit button
          idPrefix=""
          idSeparator=""
          id="plugin_parameters"
          templates={{ BaseInputTemplate }}
        />
      ) : (
        'No plugin selected...'
      )}
    </>
  );
}
