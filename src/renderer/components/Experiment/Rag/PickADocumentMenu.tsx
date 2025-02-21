import { Option, Select } from '@mui/joy';
import { useState } from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PickADocumentMenu({
  name,
  experimentInfo,
  showFoldersOnly = false,
}) {
  const {
    data: rows,
    isLoading,
    mutate,
  } = useSWR(chatAPI.Endpoints.Documents.List(experimentInfo?.id, ''), fetcher);

  const [selected, setSelected] = useState([]);

  function handleChange(event, newValue) {
    console.log(newValue);
    setSelected(newValue);
  }

  return (
    <Select multiple onChange={handleChange} value={selected} name={name}>
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
