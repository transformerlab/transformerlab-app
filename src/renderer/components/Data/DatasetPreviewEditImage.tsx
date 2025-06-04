import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Table,
  Input,
  Select,
  Option,
  Box,
  LinearProgress,
  Button,
  Stack,
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
} from '@mui/joy';
import { Plus, Minus } from 'lucide-react';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

const DatasetPreviewEditImage = ({ datasetId, template }) => {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const [modifiedRows, setModifiedRows] = useState(new Map());
  const [newDatasetId, setNewDatasetId] = useState('');
  const [availableSplits, setAvailableSplits] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedSplitFilter, setSelectedSplitFilter] = useState('');
  const [selectedLabelFilter, setSelectedLabelFilter] = useState('');
  const [addColumnModalOpen, setAddColumnModalOpen] = useState(false);
  const [removeColumnModalOpen, setRemoveColumnModalOpen] = useState(false);
  const [columnNameInput, setColumnNameInput] = useState('');
  const [columnToRemove, setColumnToRemove] = useState('');
  const limit = 50;
  const containerRef = useRef(null);

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
      const response = await fetch(url);
      const result = await response.json();
      if (result.status === 'success') {
        const newRows = result.data.rows || [];
        const updatedRows = [...rows, ...newRows].map((r) => ({
          ...r,
          label: r.label ?? '',
        }));

        const dynamicColumns = Array.from(
          new Set(updatedRows.flatMap((r) => Object.keys(r))),
        ).filter((c) => c !== 'image' && !c.startsWith('__'));

        const orderedColumns = [
          'split',
          'label',
          ...dynamicColumns.filter((c) => !['split', 'label'].includes(c)),
        ];

        setRows(updatedRows);
        setColumns(orderedColumns);
        setOffset((prev) => prev + limit);
        if (newRows.length < limit) setHasMore(false);

        const splits = [
          ...new Set(updatedRows.map((r) => r.split).filter(Boolean)),
        ];
        const labels = [
          ...new Set(updatedRows.map((r) => r.label).filter(Boolean)),
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
    setModifiedRows(new Map());
  }, [datasetId, template]);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  const onScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 50) loadMore();
  };

  const saveEditsWithName = async (datasetName) => {
    if (datasetName.trim() === '') {
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
        chatAPI.Endpoints.Dataset.Info(datasetName),
      );
      const datasetInfo = await checkResponse.json();
      if (
        Object.keys(datasetInfo).length !== 0 &&
        datasetInfo.status !== 'error'
      ) {
        alert(
          `Dataset "${datasetName}" already exists. Please choose a different name.`,
        );
        setSaving(false);
        return;
      }

      const fullArray = rows.map((row) => {
        const uniqueKey = row['__index__'];
        const modified = modifiedRows.get(uniqueKey) || {};
        return {
          ...row,
          ...modified,
        };
      });

      const formData = new FormData();
      const blob = new Blob([JSON.stringify(fullArray)], {
        type: 'application/json',
      });
      formData.append('file', blob, 'metadata_updates.json');
      const response = await fetch(
        chatAPI.Endpoints.Dataset.SaveMetadata(datasetId, datasetName),
        {
          method: 'POST',
          body: formData,
        },
      );
      if (!response.ok) throw new Error('Failed to save');
      alert('Changes saved successfully!');
      setModifiedRows(new Map());
    } catch (err) {
      alert(`Error saving captions: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFieldUpdate = (index, field, value) => {
    setModifiedRows((prev) => {
      const updated = new Map(prev);
      const original = rows.find((r) => r['__index__'] === index) || {};
      const current = updated.get(index) || { ...original };
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
          [field]: value,
        };
      }
      return updatedRows;
    });
  };

  const handleAddColumn = () => {
    const col = columnNameInput.trim();
    const isValid = col && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col);
    if (!isValid) {
      alert(
        'Invalid column name. Use letters, numbers, and underscores. Must not start with a digit.',
      );
      return;
    }
    if (columns.includes(col)) {
      alert('This column already exists.');
      setAddColumnModalOpen(false);
      setColumnNameInput('');
      return;
    }
    setColumns([...columns, col]);
    setRows(rows.map((r) => ({ ...r, [col]: '' })));
    setAddColumnModalOpen(false);
    setColumnNameInput('');
  };

  const handleRemoveColumn = () => {
    const protectedCols = ['image', 'file_name', 'split', 'label'];
    if (!columns.includes(columnToRemove)) {
      alert('Column not found.');
      setRemoveColumnModalOpen(false);
      setColumnToRemove('');
      return;
    }
    if (protectedCols.includes(columnToRemove)) {
      alert(`"${columnToRemove}" is a required column and cannot be removed.`);
      setRemoveColumnModalOpen(false);
      setColumnToRemove('');
      return;
    }

    setColumns(columns.filter((c) => c !== columnToRemove));
    setRows(
      rows.map((r) => {
        const newRow = { ...r };
        delete newRow[columnToRemove];
        return newRow;
      }),
    );
    setRemoveColumnModalOpen(false);
    setColumnToRemove('');
  };

  const filteredRows = rows.filter(
    (row) =>
      (!selectedSplitFilter || row.split === selectedSplitFilter) &&
      (!selectedLabelFilter || row.label === selectedLabelFilter) &&
      (typeof row['text'] === 'string'
        ? row['text'].toLowerCase()
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
      {loading && rows.length > 0 && (
        <Box p={1} display="flex" justifyContent="center">
          <LinearProgress sx={{ width: '100%' }} />
        </Box>
      )}

      <Box p={1} display="flex" gap={2} alignItems="center">
        <Input
          placeholder="New Dataset Name"
          value={newDatasetId}
          onChange={(e) => setNewDatasetId(e.target.value)}
          sx={{ width: '250px' }}
        />
        <Input
          placeholder="Search captions..."
          sx={{ width: '400px' }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Select
          value={selectedSplitFilter}
          onChange={(_, v) => setSelectedSplitFilter(v)}
          placeholder="Filter by Split"
          sx={{ width: '200px' }}
        >
          <Option value="">All</Option>
          {availableSplits.map((s) => (
            <Option key={s} value={s}>
              {s}
            </Option>
          ))}
        </Select>
        <Select
          value={selectedLabelFilter}
          onChange={(_, v) => setSelectedLabelFilter(v)}
          placeholder="Filter by Label"
          sx={{ width: '200px' }}
        >
          <Option value="">All</Option>
          {availableLabels.map((l) => (
            <Option key={l} value={l}>
              {l}
            </Option>
          ))}
        </Select>
        <Button
          onClick={() => saveEditsWithName(newDatasetId)}
          loading={saving}
          variant="soft"
          disabled={
            rows.length === 0 ||
            newDatasetId.trim() === '' ||
            modifiedRows.size === 0
          }
        >
          Save Changes
        </Button>
        <Button onClick={() => setAddColumnModalOpen(true)}>
          <Plus size={16} />
        </Button>
        <Button onClick={() => setRemoveColumnModalOpen(true)}>
          <Minus size={16} />
        </Button>
      </Box>

      <Box sx={{ overflowX: 'auto', flex: 1, width: '100%' }}>
        <Table
          sx={{
            minWidth: 'max-content',
            width: 'max-content',
            tableLayout: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <thead>
            <tr>
              <th>Image</th>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr key={row?.['__index__'] || idx}>
                <td>
                  {row['image'] && (
                    <img
                      src={row['image']}
                      alt={`example-${idx}`}
                      style={{ maxHeight: '100px' }}
                    />
                  )}
                </td>
                {columns.map((col) => (
                  <td key={col}>
                    <Input
                      value={
                        modifiedRows.get(row['__index__'])?.[col] ??
                        row[col] ??
                        ''
                      }
                      onChange={(e) =>
                        handleFieldUpdate(row['__index__'], col, e.target.value)
                      }
                      size="sm"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </Box>
      {loading && rows.length > 0 && <LinearProgress />}

      <Modal
        open={addColumnModalOpen}
        onClose={() => setAddColumnModalOpen(false)}
      >
        <ModalDialog>
          <ModalClose />
          <Typography level="h4">Add Column</Typography>
          <Input
            slotProps={{ input: { autoFocus: true } }}
            placeholder="New column name"
            value={columnNameInput}
            onChange={(e) => setColumnNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddColumn();
                setAddColumnModalOpen(false);
                setColumnNameInput('');
              }
            }}
          />
          <Button onClick={handleAddColumn}>Add</Button>
        </ModalDialog>
      </Modal>

      <Modal
        open={removeColumnModalOpen}
        onClose={() => setRemoveColumnModalOpen(false)}
      >
        <ModalDialog>
          <ModalClose />
          <Typography level="h4">Remove Column</Typography>
          <Input
            slotProps={{ input: { autoFocus: true } }}
            placeholder="Column name to remove"
            value={columnToRemove}
            onChange={(e) => setColumnToRemove(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRemoveColumn();
                setRemoveColumnModalOpen(false);
                setColumnToRemove('');
              }
            }}
          />
          <Button color="danger" onClick={handleRemoveColumn}>
            Confirm Remove
          </Button>
        </ModalDialog>
      </Modal>
    </Box>
  );
};

export default DatasetPreviewEditImage;
