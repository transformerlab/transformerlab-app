import { Option, Select } from '@mui/joy';
import { useState, useEffect } from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';

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
  } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Documents.List(experimentInfo.id, '')
      : null,
  );

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
        ),
      )}
    </Select>
  );
}
