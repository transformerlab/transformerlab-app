import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Table,
  Input,
  Select,
  Option,
  Box,
  LinearProgress,
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
  const limit = 50;
  const containerRef = useRef(null);
  const [availableSplits, setAvailableSplits] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedSplit, setSelectedSplit] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');

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

        const allRows = [...rows, ...newRows];
        const splits = [
          ...new Set(allRows.map((r) => r.split).filter(Boolean)),
        ];
        const labels = [
          ...new Set(allRows.map((r) => r.label).filter(Boolean)),
        ];
        setAvailableSplits(splits);
        setAvailableLabels(labels);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [datasetId, template, offset, loading, hasMore, rows]);

  useEffect(() => {
    setRows([]);
    setColumns([]);
    setOffset(0);
    setHasMore(true);
    setLoading(false);
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

  const imageKey = columns[0]; // First column is always image
  const textKey = columns[1]; // Second column is always description

  const filteredRows = rows.filter(
    (row) =>
      (!selectedSplit || row.split === selectedSplit) &&
      (!selectedLabel || row.label === selectedLabel) &&
      (typeof row[textKey] === 'string'
        ? row[textKey].toLowerCase()
        : ''
      ).includes(searchText.toLowerCase()),
  );

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
          sx={{ width: '400px' }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Typography level="body-md" sx={{ fontWeight: 'bold' }}>
          Split:
        </Typography>
        <Select
          value={selectedSplit}
          onChange={(_, v) => setSelectedSplit(v)}
          size="lg"
          sx={{ minWidth: '150px' }}
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
          size="lg"
          sx={{ minWidth: '150px' }}
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
