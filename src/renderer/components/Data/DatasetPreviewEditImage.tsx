import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Table,
  Input,
  Select,
  Option,
  CircularProgress,
  Box,
  LinearProgress,
  Button,
  Typography,
} from '@mui/joy';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
const fetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
};

const DatasetPreviewEditImage = ({ datasetId, template }) => {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const [modifiedRows, setModifiedRows] = useState(new Map());
  const [newDatasetId, setNewDatasetName] = useState('');
  const limit = 50;
  const containerRef = useRef(null);
  const [availableSplits, setAvailableSplits] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedSplit, setSelectedSplit] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isParquet, setIsParquet] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const url = chatAPI.Endpoints.Dataset.EditWithTemplate(
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

  useEffect(() => {
    const fetchInfo = async () => {
      const res = await fetch(chatAPI.Endpoints.Dataset.Info(datasetId));
      const data = await res.json();
      setAvailableSplits(data.splits || []);
      setAvailableLabels(data.labels || []);
      setIsParquet(data.is_parquet || false);
    };
    fetchInfo();
  }, [datasetId]);

  const onScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      loadMore();
    }
  };

  const handleFieldUpdate = (index, field, value) => {
    setModifiedRows((prev) => {
      const updated = new Map(prev);
      const original = rows.find((r) => r['__index__'] === index) || {};
      const current = updated.get(index) || {
        file_name: original['file_name'],
        previous_label: original['label'],
        previous_caption: original['text'],
        previous_split: original['split'],
        label: original['label'] || '',
        caption: original['text'] || '',
        split: original['split'] || '',
      };
      current[field] = value;
      updated.set(index, current);
      return updated;
    });

    setRows((prev) => {
      const updatedRows = [...prev];
      const rowIndex = updatedRows.findIndex((r) => r['__index__'] === index);
      if (rowIndex !== -1) {
        updatedRows[rowIndex] = {
          ...updatedRows[rowIndex],
          [field === 'caption' ? 'text' : field]: value,
        };
      }
      return updatedRows;
    });
  };

  const filteredRows = rows.filter(
    (row) =>
      (!selectedSplit || row.split === selectedSplit) &&
      (!selectedLabel || row.label === selectedLabel) &&
      (typeof row['text'] === 'string'
        ? row['text'].toLowerCase()
        : ''
      ).includes(searchText.toLowerCase()),
  );

  const saveEdits = async () => {
    if (newDatasetId.trim() === '') {
      alert('Please enter a new dataset name.');
      return;
    }

    if (rows.length === 0) {
      alert('No data to save.');
      return;
    }

    setSaving(true);
    try {
      const checkResponse = await fetch(
        chatAPI.Endpoints.Dataset.Info(newDatasetId),
      );
      if (checkResponse.ok) {
        const datasetInfo = await checkResponse.json();
        if (
          !(
            datasetInfo?.status === 'error' &&
            datasetInfo?.message === 'Dataset not found.'
          )
        ) {
          alert(
            `Dataset "${newDatasetId}" already exists. Please choose a different name.`,
          );
          setSaving(false);
          return;
        }
      }

      const fullArray = rows.map((row) => {
        const uniqueKey = row['__index__'];
        const modified = modifiedRows.get(uniqueKey) || {};
        return {
          file_name: row['file_name'],
          previous_label: row['label'] || '',
          previous_caption: row['text'] || '',
          previous_split: row['split'] || '',
          label: modified.label !== undefined ? modified.label : '',
          caption: modified.caption !== undefined ? modified.caption : '',
          split: modified.split !== undefined ? modified.split : '',
        };
      });

      console.log('Saving full dataset to backend:', {
        dataset_id: datasetId,
        new_dataset_name: newDatasetId.trim(),
        full_data: fullArray,
      });

      const formData = new FormData();
      const blob = new Blob([JSON.stringify(fullArray)], {
        type: 'application/json',
      });
      formData.append('file', blob, 'metadata_updates.json');

      const response = await fetch(
        chatAPI.Endpoints.Dataset.SaveMetadata(datasetId, newDatasetId),
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) throw new Error('Failed to save');
      alert('Captions saved successfully!');
    } catch (err) {
      alert(`Error saving captions: ${err.message}`);
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
          placeholder="New Dataset Name"
          value={newDatasetId}
          onChange={(e) => setNewDatasetName(e.target.value)}
          required
          sx={{ width: '400px' }}
        />
        <Input
          placeholder="Search captions..."
          sx={{ width: '400px' }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Button
          onClick={saveEdits}
          loading={saving}
          variant="soft"
          disabled={isParquet || rows.length === 0}
        >
          Save Changes
        </Button>
      </Box>
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <Table sx={{ minWidth: '100%' }}>
          <thead>
            <tr>
              <th>Image</th>
              <th>Description</th>
              <th>Split</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr key={row?.['__index__'] || idx}>
                <td>
                  {row['image'] && typeof row['image'] === 'string' && (
                    <img
                      src={row['image']}
                      alt={`example-${idx}`}
                      style={{ maxHeight: '100px' }}
                    />
                  )}
                </td>
                <td>
                  <Input
                    value={
                      modifiedRows.get(row['__index__'])?.caption ??
                      row['text'] ??
                      ''
                    }
                    onChange={(e) =>
                      handleFieldUpdate(
                        row['__index__'],
                        'caption',
                        e.target.value,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    variant="soft"
                    size="sm"
                    fullWidth
                    disabled={isParquet}
                    sx={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'break-word',
                      wordWrap: 'break-word',
                      display: 'block',
                      minHeight: '2em',
                    }}
                  />
                </td>
                <td>
                  <Input
                    value={
                      modifiedRows.get(row['__index__'])?.split ??
                      row['split'] ??
                      ''
                    }
                    onChange={(e) =>
                      handleFieldUpdate(
                        row['__index__'],
                        'split',
                        e.target.value,
                      )
                    }
                    size="sm"
                  />
                </td>
                <td>
                  <Input
                    value={
                      modifiedRows.get(row['__index__'])?.label ??
                      row['label'] ??
                      ''
                    }
                    onChange={(e) =>
                      handleFieldUpdate(
                        row['__index__'],
                        'label',
                        e.target.value,
                      )
                    }
                    size="sm"
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

export default DatasetPreviewEditImage;
