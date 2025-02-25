import { Option, Select } from '@mui/joy';
import { useState, useEffect } from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PickADocumentMenu({
  name,
  experimentInfo,
  value,
  onChange,
  defaultValue = [],
  required = false,
  showFoldersOnly = false,
}) {
  const {
    data: rows,
    isLoading,
    mutate,
  } = useSWR(chatAPI.Endpoints.Documents.List(experimentInfo?.id, ''), fetcher);

  function handleChange(event, newValue) {
    console.log(newValue);
    onChange(newValue);
  }

  return (
    <Select
      multiple
      onChange={handleChange}
      value={value}
      name={name}
      required={required}
    >
      {rows?.map((row) =>
        showFoldersOnly ? (
          row?.type === 'folder' && (
            <Option key={row.name} value={row.name}>
              {row.name}
            </Option>
          )
        ) : (
          <Option key={row.name} value={row.name}>
            {row.name}
          </Option>
        )
      )}
    </Select>
  );
}
