/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import Form from '@rjsf/core';

const schema: RJSFSchema = {
  title: 'Todo',
  type: 'object',
  required: ['title'],
  properties: {
    title: { type: 'string', title: 'Title', default: 'A new task' },
    number: { type: 'integer', title: 'Integer' },
    done: { type: 'boolean', title: 'Done?', default: false },
  },
};

const log = (type) => console.log.bind(console, type);

export default function DynamicPluginForm({ plugin }) {
  return (
    <>
      {plugin}
      {plugin ? (
        <Form className="pure-form" schema={schema} validator={validator} />
      ) : (
        'No plugin selected'
      )}
    </>
  );
}
