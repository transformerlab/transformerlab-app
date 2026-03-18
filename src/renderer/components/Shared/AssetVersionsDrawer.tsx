import { useState, useCallback, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Option,
  Select,
  Sheet,
  Stack,
  Table,
  Textarea,
  Tooltip,
  Typography,
  DialogTitle,
  ModalClose,
} from '@mui/joy';
import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  FileTextIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssetVersionEntry {
  id: string;
  asset_type: string;
  group_name: string;
  version_label: string;
  asset_id: string;
  tag: string | null;
  job_id: string | null;
  description: string | null;
  title: string | null;
  long_description: string | null;
  cover_image: string | null;
  evals: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

interface AssetVersionsDrawerProps {
  open: boolean;
  onClose: () => void;
  assetType: 'model' | 'dataset';
  groupName: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TAG_COLORS: Record<
  string,
  'success' | 'primary' | 'warning' | 'neutral'
> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

const TAG_OPTIONS = ['latest', 'production', 'draft'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// ─── Evals key-value editor ──────────────────────────────────────────────────

function EvalsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const entries = Object.entries(value);

  const handleKeyChange = (oldKey: string, newKey: string) => {
    if (newKey === oldKey) return;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  };

  const handleValueChange = (key: string, newVal: string) => {
    // Try to parse as number
    const parsed = Number(newVal);
    onChange({ ...value, [key]: isNaN(parsed) ? newVal : parsed });
  };

  const handleRemove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  const handleAdd = () => {
    let key = 'metric';
    let i = 1;
    while (key in value) {
      key = `metric_${i}`;
      i++;
    }
    onChange({ ...value, [key]: 0 });
  };

  return (
    <Box>
      {entries.map(([k, v], idx) => (
        <Stack key={idx} direction="row" gap={0.5} sx={{ mb: 0.5 }}>
          <Input
            size="sm"
            value={k}
            onChange={(e) => handleKeyChange(k, e.target.value)}
            placeholder="Key"
            sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
          />
          <Input
            size="sm"
            value={String(v ?? '')}
            onChange={(e) => handleValueChange(k, e.target.value)}
            placeholder="Value"
            sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
          />
          <IconButton
            size="sm"
            variant="plain"
            color="danger"
            onClick={() => handleRemove(k)}
          >
            <XIcon size={14} />
          </IconButton>
        </Stack>
      ))}
      <Button
        size="sm"
        variant="plain"
        color="neutral"
        startDecorator={<PlusIcon size={14} />}
        onClick={handleAdd}
        sx={{ mt: 0.5 }}
      >
        Add metric
      </Button>
    </Box>
  );
}

// ─── Version detail / edit panel ─────────────────────────────────────────────

function VersionDetailPanel({
  entry,
  assetType,
  groupName,
  onBack,
  onMutate,
}: {
  entry: AssetVersionEntry;
  assetType: string;
  groupName: string;
  onBack: () => void;
  onMutate: () => void;
}) {
  // Local editable state, initialised from the entry
  const [title, setTitle] = useState(entry.title ?? '');
  const [description, setDescription] = useState(entry.description ?? '');
  const [longDescription, setLongDescription] = useState(
    entry.long_description ?? '',
  );
  const [coverImage, setCoverImage] = useState(entry.cover_image ?? '');
  const [tag, setTag] = useState<string | null>(entry.tag);
  const [evals, setEvals] = useState<Record<string, unknown>>(
    entry.evals ?? {},
  );
  const [metadataJson, setMetadataJson] = useState(
    entry.metadata ? JSON.stringify(entry.metadata, null, 2) : '{}',
  );
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showProdWarning, setShowProdWarning] = useState(false);
  const [pendingTag, setPendingTag] = useState<string | null>(null);

  // Reset local state when entry changes
  useEffect(() => {
    setTitle(entry.title ?? '');
    setDescription(entry.description ?? '');
    setLongDescription(entry.long_description ?? '');
    setCoverImage(entry.cover_image ?? '');
    setTag(entry.tag);
    setEvals(entry.evals ?? {});
    setMetadataJson(
      entry.metadata
        ? JSON.stringify(entry.metadata, null, 2)
        : '{}',
    );
    setMetadataError(null);
    setSaved(false);
  }, [entry]);

  // ── PATCH save ──

  const handleSave = useCallback(async () => {
    // Validate metadata JSON
    let parsedMetadata: Record<string, unknown> | undefined;
    try {
      parsedMetadata = JSON.parse(metadataJson);
    } catch {
      setMetadataError('Invalid JSON');
      return;
    }
    setMetadataError(null);

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title || null,
        description: description || null,
        long_description: longDescription || null,
        cover_image: coverImage || null,
        evals: Object.keys(evals).length > 0 ? evals : null,
        metadata: parsedMetadata,
      };
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.UpdateVersion(
          assetType,
          groupName,
          entry.version_label,
        ),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      onMutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to update version:', err);
    } finally {
      setSaving(false);
    }
  }, [
    assetType,
    groupName,
    entry.version_label,
    title,
    description,
    longDescription,
    coverImage,
    evals,
    metadataJson,
    onMutate,
  ]);

  // ── Tag management ──

  const handleTagChange = (_e: unknown, val: string | null) => {
    if (val === 'production' && entry.tag !== 'production') {
      setPendingTag(val);
      setShowProdWarning(true);
      return;
    }
    applyTag(val);
  };

  const applyTag = async (newTag: string | null) => {
    setShowProdWarning(false);
    setPendingTag(null);
    setSaving(true);
    try {
      if (newTag) {
        await fetchWithAuth(
          chatAPI.Endpoints.AssetVersions.SetTag(
            assetType,
            groupName,
            entry.version_label,
          ),
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: newTag }),
          },
        );
      } else {
        await fetchWithAuth(
          chatAPI.Endpoints.AssetVersions.ClearTag(
            assetType,
            groupName,
            entry.version_label,
          ),
          { method: 'DELETE' },
        );
      }
      setTag(newTag);
      onMutate();
    } catch (err) {
      console.error('Failed to update tag:', err);
    } finally {
      setSaving(false);
    }
  };

  const typeLabel = assetType === 'model' ? 'Model' : 'Dataset';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton size="sm" variant="plain" onClick={onBack}>
            <ChevronLeftIcon size={18} />
          </IconButton>
          <Typography level="title-md" fontFamily="monospace">
            {entry.version_label}
          </Typography>
          {tag && (
            <Chip size="sm" color={TAG_COLORS[tag] || 'neutral'} variant="soft">
              {tag}
            </Chip>
          )}
        </Stack>
        <Button
          size="sm"
          variant="solid"
          color={saved ? 'success' : 'primary'}
          loading={saving}
          startDecorator={
            saved ? <CheckIcon size={14} /> : <SaveIcon size={14} />
          }
          onClick={handleSave}
        >
          {saved ? 'Saved' : 'Save'}
        </Button>
      </Box>

      {/* Scrollable form */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Stack spacing={2.5}>
          {/* ── Read-only info ── */}
          <Box>
            <Typography
              level="body-xs"
              textTransform="uppercase"
              fontWeight="lg"
              sx={{ mb: 1 }}
            >
              Version Info
            </Typography>
            <Stack spacing={1}>
              <Stack direction="row" gap={1} alignItems="center">
                <Typography
                  level="body-sm"
                  fontWeight="lg"
                  sx={{ minWidth: 90 }}
                >
                  {typeLabel} ID:
                </Typography>
                <Typography level="body-sm" fontFamily="monospace">
                  {entry.asset_id}
                </Typography>
              </Stack>
              <Stack direction="row" gap={1} alignItems="center">
                <Typography
                  level="body-sm"
                  fontWeight="lg"
                  sx={{ minWidth: 90 }}
                >
                  Created:
                </Typography>
                <Stack direction="row" alignItems="center" gap={0.5}>
                  <CalendarIcon size={13} />
                  <Typography level="body-sm">
                    {formatDate(entry.created_at)}
                  </Typography>
                </Stack>
              </Stack>
              <Stack direction="row" gap={1} alignItems="center">
                <Typography
                  level="body-sm"
                  fontWeight="lg"
                  sx={{ minWidth: 90 }}
                >
                  Source Job:
                </Typography>
                {entry.job_id ? (
                  <Chip size="sm" variant="outlined" color="neutral">
                    <BriefcaseIcon size={12} />
                    &nbsp;{String(entry.job_id)}
                  </Chip>
                ) : (
                  <Typography level="body-sm" color="neutral">
                    —
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Box>

          <Divider />

          {/* ── Tag selector ── */}
          <FormControl>
            <FormLabel>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <TagIcon size={14} />
                Tag
              </Stack>
            </FormLabel>
            <Stack direction="row" gap={1} alignItems="center">
              <Select
                size="sm"
                placeholder="No tag"
                value={tag}
                onChange={handleTagChange}
                sx={{ minWidth: 160 }}
              >
                {TAG_OPTIONS.map((t) => (
                  <Option key={t} value={t}>
                    {t}
                  </Option>
                ))}
              </Select>
              {tag && (
                <IconButton
                  size="sm"
                  variant="plain"
                  color="neutral"
                  onClick={() => applyTag(null)}
                >
                  <XIcon size={14} />
                </IconButton>
              )}
            </Stack>
            {showProdWarning && (
              <Alert
                color="warning"
                variant="soft"
                size="sm"
                startDecorator={<AlertTriangleIcon size={16} />}
                sx={{ mt: 1 }}
                endDecorator={
                  <Stack direction="row" gap={0.5}>
                    <Button
                      size="sm"
                      variant="solid"
                      color="warning"
                      onClick={() => applyTag(pendingTag)}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="plain"
                      color="neutral"
                      onClick={() => {
                        setShowProdWarning(false);
                        setPendingTag(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                }
              >
                Setting the <b>production</b> tag will move it from any other
                version in this group.
              </Alert>
            )}
          </FormControl>

          <Divider />

          {/* ── Editable metadata ── */}
          <Typography level="body-xs" textTransform="uppercase" fontWeight="lg">
            Metadata
          </Typography>

          <FormControl>
            <FormLabel>Title</FormLabel>
            <Input
              size="sm"
              placeholder={`Version title (e.g. "Fine-tuned for code")`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormControl>

          <FormControl>
            <FormLabel>Short Description</FormLabel>
            <Input
              size="sm"
              placeholder="Brief description of this version"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormControl>

          <FormControl>
            <FormLabel>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <FileTextIcon size={14} />
                Long Description (Markdown)
              </Stack>
            </FormLabel>
            <Textarea
              size="sm"
              minRows={4}
              maxRows={12}
              placeholder="Detailed description — Markdown supported"
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </FormControl>

          <FormControl>
            <FormLabel>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <ImageIcon size={14} />
                Cover Image URL
              </Stack>
            </FormLabel>
            <Input
              size="sm"
              placeholder="https://example.com/image.png"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
            />
            {coverImage && (
              <Box
                sx={{
                  mt: 1,
                  borderRadius: 'sm',
                  overflow: 'hidden',
                  maxWidth: 200,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <img
                  src={coverImage}
                  alt="Cover preview"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </Box>
            )}
          </FormControl>

          <Divider />

          {/* ── Evals key-value editor ── */}
          <FormControl>
            <FormLabel>Evaluation Metrics</FormLabel>
            <EvalsEditor value={evals} onChange={setEvals} />
          </FormControl>

          <Divider />

          {/* ── Raw metadata JSON ── */}
          <FormControl error={!!metadataError}>
            <FormLabel>Raw Metadata (JSON)</FormLabel>
            <Textarea
              size="sm"
              minRows={4}
              maxRows={16}
              value={metadataJson}
              onChange={(e) => {
                setMetadataJson(e.target.value);
                if (metadataError) {
                  try {
                    JSON.parse(e.target.value);
                    setMetadataError(null);
                  } catch {
                    // keep error
                  }
                }
              }}
              sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
            {metadataError && (
              <Typography level="body-xs" color="danger" sx={{ mt: 0.5 }}>
                {metadataError}
              </Typography>
            )}
          </FormControl>
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Main drawer component ───────────────────────────────────────────────────

export default function AssetVersionsDrawer({
  open,
  onClose,
  assetType,
  groupName,
}: AssetVersionsDrawerProps) {
  const [updatingVersion, setUpdatingVersion] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  const {
    data: versions,
    isLoading,
    mutate,
  } = useSWR(
    open && groupName
      ? chatAPI.Endpoints.AssetVersions.ListVersions(assetType, groupName)
      : null,
    fetcher,
  );

  // Reset selection when drawer closes or group changes
  useEffect(() => {
    if (!open) setSelectedVersion(null);
  }, [open, groupName]);

  const handleSetTag = async (versionLabel: string, tag: string) => {
    setUpdatingVersion(versionLabel);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.SetTag(assetType, groupName, versionLabel),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        },
      );
      mutate();
    } catch (error) {
      console.error('Failed to set tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleClearTag = async (versionLabel: string) => {
    setUpdatingVersion(versionLabel);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.ClearTag(assetType, groupName, versionLabel),
        { method: 'DELETE' },
      );
      mutate();
    } catch (error) {
      console.error('Failed to clear tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleDeleteVersion = async (versionLabel: string) => {
    if (
      !window.confirm(
        `Delete version ${versionLabel} from group "${groupName}"? This will not delete the underlying ${assetType}.`,
      )
    ) {
      return;
    }
    setUpdatingVersion(versionLabel);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteVersion(
          assetType,
          groupName,
          versionLabel,
        ),
        { method: 'DELETE' },
      );
      if (selectedVersion === versionLabel) setSelectedVersion(null);
      mutate();
    } catch (error) {
      console.error('Failed to delete version:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const versionList: AssetVersionEntry[] = Array.isArray(versions)
    ? versions
    : [];

  const typeLabel = assetType === 'model' ? 'Model' : 'Dataset';

  // Find the selected entry
  const selectedEntry =
    selectedVersion !== null
      ? (versionList.find((v) => v.version_label === selectedVersion) ?? null)
      : null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      size="lg"
      slotProps={{
        content: {
          sx: {
            width: { xs: '100vw', sm: 640 },
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      {/* ── Header (always visible) ── */}
      <Sheet sx={{ p: 2.5, pb: 1.5 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" gap={1}>
              <TagIcon size={20} />
              <Typography level="title-lg">
                {typeLabel} Versions: <b>{groupName}</b>
              </Typography>
            </Stack>
          </DialogTitle>
          <ModalClose />
        </Stack>
        <Typography level="body-sm" sx={{ mt: 0.5 }}>
          {versionList.length} version{versionList.length !== 1 ? 's' : ''} in
          this group.{' '}
          {selectedEntry
            ? 'Editing version details.'
            : 'Click a version to view and edit its details.'}
        </Typography>
      </Sheet>

      <Divider />

      {/* ── Body: version list OR detail panel ── */}
      {selectedEntry ? (
        <VersionDetailPanel
          entry={selectedEntry}
          assetType={assetType}
          groupName={groupName}
          onBack={() => setSelectedVersion(null)}
          onMutate={() => mutate()}
        />
      ) : (
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                py: 8,
              }}
            >
              <CircularProgress />
            </Box>
          ) : versionList.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography level="body-lg" color="neutral">
                No versions found for this group.
              </Typography>
            </Box>
          ) : (
            <Table
              size="sm"
              sx={{
                '& thead th': { textAlign: 'left' },
                '& tbody td': { verticalAlign: 'middle' },
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Ver</th>
                  <th>{typeLabel} ID</th>
                  <th style={{ width: 120 }}>Tag</th>
                  <th style={{ width: 140 }}>Created</th>
                  <th style={{ width: 80 }}>Job</th>
                  <th style={{ width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versionList.map((v) => (
                  <tr
                    key={v.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedVersion(v.version_label)}
                  >
                    <td>
                      <Typography level="title-sm" fontFamily="monospace">
                        {v.version_label}
                      </Typography>
                    </td>
                    <td>
                      <Tooltip title={v.description || v.asset_id}>
                        <Typography
                          level="body-sm"
                          noWrap
                          sx={{ maxWidth: 160 }}
                        >
                          {v.asset_id}
                        </Typography>
                      </Tooltip>
                    </td>
                    <td>
                      {updatingVersion === v.version_label ? (
                        <CircularProgress size="sm" />
                      ) : v.tag ? (
                        <Chip
                          size="sm"
                          color={TAG_COLORS[v.tag] || 'neutral'}
                          variant="soft"
                          endDecorator={
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClearTag(v.version_label);
                              }}
                              sx={{ '--IconButton-size': '18px', ml: 0.5 }}
                            >
                              <XIcon size={12} />
                            </IconButton>
                          }
                        >
                          {v.tag}
                        </Chip>
                      ) : (
                        <Select
                          size="sm"
                          placeholder="Set tag…"
                          value={null}
                          onChange={(_e, val) => {
                            if (val) handleSetTag(v.version_label, val as string);
                          }}
                          sx={{ minWidth: 100 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Option value="latest">latest</Option>
                          <Option value="production">production</Option>
                          <Option value="draft">draft</Option>
                        </Select>
                      )}
                    </td>
                    <td>
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <CalendarIcon size={12} />
                        <Typography level="body-xs">
                          {formatDate(v.created_at)}
                        </Typography>
                      </Stack>
                    </td>
                    <td>
                      {v.job_id ? (
                        <Tooltip title={`Job ${v.job_id}`}>
                          <Chip size="sm" variant="outlined" color="neutral">
                            <BriefcaseIcon size={12} />
                            &nbsp;{String(v.job_id).slice(0, 6)}
                          </Chip>
                        </Tooltip>
                      ) : (
                        <Typography level="body-xs" color="neutral">
                          —
                        </Typography>
                      )}
                    </td>
                    <td>
                      <Stack direction="row" gap={0.5}>
                        <Tooltip title="Edit details">
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVersion(v.version_label);
                            }}
                          >
                            <PencilIcon size={15} />
                          </IconButton>
                        </Tooltip>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteVersion(v.version_label);
                          }}
                          disabled={updatingVersion === v.version_label}
                        >
                          <Trash2Icon size={15} />
                        </IconButton>
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Box>
      )}
    </Drawer>
  );
}
