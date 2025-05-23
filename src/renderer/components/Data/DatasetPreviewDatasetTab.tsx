import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Table,
  Input,
  CircularProgress,
  Box,
  Alert,
  LinearProgress,
  Button,
  Typography,
} from '@mui/joy';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
const fetcher = (url) =>
  fetch(url)
    .then((res) => res.json())
    .then((data) => data);

const DatasetTableWithTemplateDatasetTab = ({ datasetId, template }) => {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const [modifiedRows, setModifiedRows] = useState(new Map());
  const limit = 50;
  const containerRef = useRef(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const url = chatAPI.Endpoints.Dataset.PreviewWithTemplate(
        datasetId,
        encodeURIComponent(template),
        offset,
        limit,
      );
      const result = await fetcher(url);
      if (result.status === 'success') {
        const newRows = result.data.rows || [];
        setRows((prev) => [...prev, ...newRows]);
        setColumns(result.data.columns || []);
        setOffset((prev) => prev + limit);
        if (newRows.length < limit) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [datasetId, template, offset, loading, hasMore]);

  useEffect(() => {
    setRows([]);
    setColumns([]);
    setOffset(0);
    setHasMore(true);
    setLoading(false);
    setModifiedRows(new Map());
  }, [datasetId, template]);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  const onScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      loadMore();
    }
  };

  const imageKey = columns.find((key) => key.toLowerCase().includes('image'));
  const textKey = columns.find(
    (key) =>
      key.toLowerCase().includes('text') ||
      key.toLowerCase().includes('caption'),
  );

  const updateCaption = (index, newText) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [textKey]: newText };
      const uniqueKey = updated[index]['__index__'];
      setModifiedRows((prevMap) =>
        new Map(prevMap).set(uniqueKey, updated[index]),
      );
      return updated;
    });
  };

  const filteredRows = rows.filter((row) => {
    const text = row[textKey] || '';
    return text.toLowerCase().includes(searchText.toLowerCase());
  });

  const saveEdits = async () => {
    setSaving(true);
    try {
      // Create FormData containing the modified rows
      const formData = new FormData();
      const blob = new Blob(
        [JSON.stringify(Array.from(modifiedRows.values()))],
        { type: 'application/json' },
      );
      formData.append('file', blob, 'metadata_updates.json'); // singular, not "files"
      formData.append('dataset_id', datasetId); // required by backend as Form(...)

      // Send POST request to the same style endpoint
      const response = await fetch(
        chatAPI.Endpoints.Dataset.SaveMetadata(datasetId),
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) throw new Error('Failed to save');
      alert('Captions saved successfully!');
    } catch (err) {
      alert('Error saving captions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      ref={containerRef}
      onScroll={onScroll}
      sx={{
        overflow: 'auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {loading && rows.length === 0 && <LinearProgress />}
      <Box p={1} display="flex" gap={2} alignItems="center">
        <Input
          placeholder="Search captions..."
          fullWidth
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Button onClick={saveEdits} loading={saving} variant="soft">
          Save Changes
        </Button>
      </Box>
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <Table sx={{ minWidth: '100%' }}>
          <thead>
            <tr>
              <th>Image</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr key={row?.['__index__'] || idx}>
                <td>
                  {imageKey &&
                    row[imageKey] &&
                    typeof row[imageKey] === 'string' && (
                      <img
                        src={row[imageKey]}
                        alt={`example-${idx}`}
                        style={{ maxHeight: '100px' }}
                      />
                    )}
                </td>
                <td>
                  <Input
                    value={row[textKey] || ''}
                    onChange={(e) => updateCaption(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    variant="soft"
                    size="sm"
                    fullWidth
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Box>
      {loading && rows.length > 0 && <LinearProgress />}
    </Box>
  );
};

export default DatasetTableWithTemplateDatasetTab;
