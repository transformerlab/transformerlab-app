/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import Form from '@rjsf/core';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { Typography } from '@mui/joy';
import { useMemo } from 'react';

const schemaTemplate: RJSFSchema = {
  type: 'object',
  required: ['title'],
  properties: {
    title: { type: 'string', title: 'Title', default: 'A new task' },
    number: { type: 'integer', title: 'Integer' },
    done: { type: 'boolean', title: 'Done?', default: false },
  },
};

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
        />
      ) : (
        'No plugin selected...'
      )}
    </>
  );
}
