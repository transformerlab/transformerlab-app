import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Table,
  Input,
  Select,
  Option,
  CircularProgress,
  Box,
  Alert,
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

const DatasetPreviewImage = ({ datasetId, template }) => {
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
  const [availableSplits, setAvailableSplits] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedSplit, setSelectedSplit] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isParquet, setIsParquet] = useState(false);

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

  const imageKey = columns[0]; // First column is always image
  const textKey = columns[1]; // Second column is always description

  const updateCaption = (index, newText) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [textKey]: newText };
      const uniqueKey = updated[index]['__index__'];
      setModifiedRows((prevMap) =>
        new Map(prevMap).set(uniqueKey, {
          ...updated[index],
          previous_caption: updated[index]['previous_caption'],
          file_name: updated[index]['file_name'],
          split: updated[index]['split'],
        }),
      );
      return updated;
    });
  };

  const filteredRows = rows.filter(
    (row) =>
      (!selectedSplit || row.split === selectedSplit) &&
      (!selectedLabel || row.label === selectedLabel) &&
      (typeof row[textKey] === 'string'
        ? row[textKey].toLowerCase()
        : ''
      ).includes(searchText.toLowerCase()),
  );

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
          sx={{ width: '400px' }} // Decrease search bar width
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Typography level="body-md" sx={{ fontWeight: 'bold' }}>
          Split:
        </Typography>
        <Select
          value={selectedSplit}
          onChange={(_, v) => setSelectedSplit(v)}
          size="lg" // Increase dropdown size
          sx={{ minWidth: '150px' }} // Adjust width if needed
        >
          <Option value="">All</Option>
          {availableSplits.map((s) => (
            <Option key={s} value={s}>
              {s}
            </Option>
          ))}
        </Select>
        <Typography level="body-md" sx={{ fontWeight: 'bold' }}>
          Label:
        </Typography>
        <Select
          value={selectedLabel}
          onChange={(_, v) => setSelectedLabel(v)}
          size="lg" // Increase dropdown size
          sx={{ minWidth: '150px' }} // Adjust width if needed
        >
          <Option value="">All</Option>
          {availableLabels.map((l) => (
            <Option key={l} value={l}>
              {l}
            </Option>
          ))}
        </Select>
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
                  <Typography
                    sx={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'break-word',
                      wordWrap: 'break-word',
                      display: 'block',
                      minHeight: '2em',
                    }}
                  >
                    {row[textKey] || ''}
                  </Typography>
                </td>
                <td>
                  <Typography>{row['split'] || 'N/A'}</Typography>
                </td>
                <td>
                  <Typography>{row['label'] || 'N/A'}</Typography>
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

export default DatasetPreviewImage;
