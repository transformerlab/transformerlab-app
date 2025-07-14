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
  FormControl,
  FormLabel,
  FormHelperText,
  Tooltip,
  Divider,
} from '@mui/joy';
import {
  Plus,
  Minus,
  ChevronLeftIcon,
  ChevronRightIcon,
  Info,
} from 'lucide-react';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';

const DatasetPreviewEditImage = ({ datasetId, template, onClose }) => {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
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
  const [datasetLen, setDatasetLen] = useState(null);
  const [numOfPages, setNumOfPages] = useState(1);
  const [pageNumber, setPageNumber] = useState(1);

  const pageSize = 50;
  const offset = (pageNumber - 1) * pageSize;

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const url = getAPIFullPath('datasets', ['editWithTemplate'], {
        datasetId,
        template: encodeURIComponent(template),
        offset,
        limit: pageSize,
      });

      const response = await fetch(url);
      const result = await response.json();
      if (result?.data?.len && datasetLen === null) {
        setDatasetLen(result.data.len);
        setNumOfPages(Math.ceil(result.data.len / pageSize));
      }

      if (result.status === 'success') {
        const newRows = result.data.rows || [];
        const updatedRows = newRows.map((r, i) => ({
          ...r,
          __index__: offset + i,
          label: r.label ?? '',
        }));

        const dynamicColumns = Array.from(
          new Set(updatedRows.flatMap((r) => Object.keys(r))),
        ).filter(
          (c) => c !== 'image' && c !== 'file_name' && !c.startsWith('__'),
        );

        const orderedColumns = [
          'split',
          'label',
          ...dynamicColumns.filter((c) => !['split', 'label'].includes(c)),
        ];

        setRows(updatedRows);
        setColumns(orderedColumns);

        const splits = [
          ...new Set(updatedRows.map((r) => r.split).filter(Boolean)),
        ];
        const labels = [
          ...new Set(updatedRows.map((r) => r.label).filter(Boolean)),
        ];
        setAvailableSplits(splits);
        setAvailableLabels(labels);
      } else {
        setRows([]);
      }
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [datasetId, template, offset]);

  useEffect(() => {
    setRows([]);
    setColumns([]);
    setHasMore(true);
    setLoading(false);
    setModifiedRows(new Map());
    setDatasetLen(null);
    setNumOfPages(1);
  }, [datasetId, template]);

  useEffect(() => {
    setRows([]);
    setColumns([]);
    setModifiedRows(new Map());
    setPageNumber(1);
  }, [datasetId, template]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

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
        getAPIFullPath('datasets', ['info'], {
          datasetId: datasetName,
        }),
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
        const merged = { ...row, ...modified };
        const { image, ...rest } = merged; // remove `image`
        return rest;
      });

      const formData = new FormData();
      const blob = new Blob([JSON.stringify(fullArray)], {
        type: 'application/json',
      });
      formData.append('file', blob, 'metadata_updates.json');
      const response = await fetch(
        getAPIFullPath('datasets', ['saveMetadata'], {
          datasetId,
          newDatasetId: datasetName,
        }),
        {
          method: 'POST',
          body: formData,
        },
      );
      if (!response.ok) throw new Error('Failed to save');
      alert('Changes saved successfully!');
      if (typeof onClose === 'function') {
        onClose();
      }
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

    // Update columns and rows
    setColumns(columns.filter((c) => c !== columnToRemove));
    setRows(
      rows.map((r) => {
        const newRow = { ...r };
        delete newRow[columnToRemove];
        return newRow;
      }),
    );

    // Clean up modifiedRows
    setModifiedRows((prev) => {
      const updated = new Map();
      for (const [index, modRow] of prev.entries()) {
        const { [columnToRemove]: _, ...rest } = modRow;
        updated.set(index, rest);
      }
      return updated;
    });

    setRemoveColumnModalOpen(false);
    setColumnToRemove('');
  };

  const filteredRows = rows.filter(
    (row) =>
      (!selectedSplitFilter || row.split === selectedSplitFilter) &&
      (!selectedLabelFilter || row.label === selectedLabelFilter) &&
      Object.values(row)
        .filter((v) => typeof v === 'string')
        .some((v) => v.toLowerCase().includes(searchText.toLowerCase())),
  );

  return (
    <Box
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

      {/* Contextual Info Banner */}
      <Box
        sx={{
          mx: 2,
          mt: 2,
          p: 2,
          bgcolor: 'primary.softBg',
          borderRadius: 'sm',
          border: '1px solid',
          borderColor: 'primary.outlinedBorder',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
        }}
      >
        <Info size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
        <Box>
          <Typography level="body-sm" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            Dataset Editor
          </Typography>
          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
            Changes create a new dataset (original unchanged). Requires new name
            + at least one edit to save. Edited split values must be one of:
            &apos;train&apos;, &apos;test&apos;, or &apos;valid&apos;.
          </Typography>
        </Box>
      </Box>

      <Box
        p={2}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 2,
          width: '100%',
        }}
      >
        {/* Left: grouped controls */}
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: '100%',
          }}
        >
          {/* Top Row: New Dataset Name + Search */}
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            <FormControl sx={{ flex: 1, minWidth: '250px' }}>
              <FormLabel>New Dataset Name</FormLabel>
              <Input
                placeholder="e.g. my-augmented-dataset"
                value={newDatasetId}
                onChange={(e) => setNewDatasetId(e.target.value)}
              />
            </FormControl>

            <FormControl sx={{ flex: 2, minWidth: '300px' }}>
              <FormLabel>Search Captions</FormLabel>
              <Input
                placeholder="Search across all fields"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </FormControl>
          </Box>

          {/* Bottom Row: Left = Filters, Right = Buttons */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: 2,
              width: '100%',
            }}
          >
            {/* Left side: Filters */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <FormControl sx={{ minWidth: '200px' }}>
                <FormLabel>Split</FormLabel>
                <Select
                  value={selectedSplitFilter}
                  onChange={(_, v) => setSelectedSplitFilter(v)}
                  placeholder="All"
                >
                  <Option value="">All</Option>
                  {availableSplits.map((s) => (
                    <Option key={s} value={s}>
                      {s}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: '200px' }}>
                <FormLabel>Label</FormLabel>
                <Select
                  value={selectedLabelFilter}
                  onChange={(_, v) => setSelectedLabelFilter(v)}
                  placeholder="All"
                >
                  <Option value="">All</Option>
                  {availableLabels.map((l) => (
                    <Option key={l} value={l}>
                      {l}
                    </Option>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Right side: + - Save */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Tooltip title="Add a new column">
                <Button
                  onClick={() => setAddColumnModalOpen(true)}
                  variant="outlined"
                  sx={{ minWidth: 'fit-content', height: '40px' }}
                >
                  <Plus size={16} />
                </Button>
              </Tooltip>

              <Tooltip title="Remove a column">
                <Button
                  onClick={() => setRemoveColumnModalOpen(true)}
                  variant="outlined"
                  sx={{ minWidth: 'fit-content', height: '40px' }}
                >
                  <Minus size={16} />
                </Button>
              </Tooltip>

              <Tooltip title="Save changes to a new dataset. Requires a new name and at least one edit.">
                <span>
                  <Button
                    onClick={() => saveEditsWithName(newDatasetId)}
                    loading={saving}
                    variant="soft"
                    disabled={
                      rows.length === 0 ||
                      newDatasetId.trim() === '' ||
                      modifiedRows.size === 0
                    }
                    sx={{
                      height: '40px',
                      width: '130px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Save Changes
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ overflowX: 'auto', flex: 1, width: '100%' }}>
        <Table
          sx={{
            minWidth: '100%',
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
                  <td key={`${row['__index__']}-${col}`}>
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
      <Divider sx={{ mt: 2 }} />

      <Box
        className="Pagination"
        sx={{
          pt: 2,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          onClick={() => setPageNumber((prev) => Math.max(prev - 1, 1))}
          disabled={pageNumber === 1}
        >
          <ChevronLeftIcon />
          Previous
        </Button>

        <Typography level="body-sm">Page {pageNumber}</Typography>

        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          onClick={() => setPageNumber((prev) => prev + 1)}
          disabled={pageNumber >= numOfPages}
        >
          Next
          <ChevronRightIcon />
        </Button>
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
