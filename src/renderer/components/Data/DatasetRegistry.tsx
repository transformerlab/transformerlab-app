/**
 * DatasetRegistry.tsx
 *
 * Displays asset-version groups for datasets (from the asset_versions API).
 * Each group renders as an expandable accordion row showing its versions.
 * This is the "Dataset Registry" tab inside Data.
 *
 * The UI mirrors the Local Models table: search bar, filters (disabled),
 * refresh button, and a clean table of versions per group.
 */

import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  DialogTitle,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Option,
  Select,
  Sheet,
  Skeleton,
  Stack,
  Table,
  Textarea,
  Tooltip,
  Typography,
} from '@mui/joy';
import {
  ChevronDownIcon,
  DatabaseIcon,
  PencilIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';

dayjs.extend(relativeTime);

// ─── Types ───────────────────────────────────────────────────────────────────

interface VersionEntry {
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

interface GroupSummary {
  group_id: string;
  group_name: string;
  asset_type: string;
  description: string;
  version_count: number;
  latest_version_label: string | null;
  latest_tag: string | null;
  latest_created_at: string | null;
}

// ─── Tag colours ─────────────────────────────────────────────────────────────

const TAG_COLORS: Record<
  string,
  'success' | 'primary' | 'warning' | 'neutral'
> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

// ─── Skeleton loader (matches LocalModelsTable pattern) ──────────────────────

function RegistrySkeleton() {
  return (
    <>
      <Box
        className="SearchAndFilters-tabletUp"
        sx={{
          borderRadius: 'sm',
          mt: 1,
          pb: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          '& > *': { minWidth: { xs: '120px', md: '160px' } },
        }}
      >
        <Skeleton
          variant="rectangular"
          sx={{ flex: 1, height: 32, borderRadius: 'sm' }}
        />
        <Skeleton
          variant="rectangular"
          sx={{ width: 160, height: 32, borderRadius: 'sm' }}
        />
      </Box>
      <Sheet
        variant="outlined"
        sx={{
          width: '100%',
          borderRadius: 'md',
          minHeight: 0,
          display: 'flex',
          overflow: 'auto',
          p: 2,
        }}
      >
        <Box sx={{ width: '100%' }}>
          {[...Array(6)].map((_, idx) => (
            <Skeleton
              key={idx}
              variant="rectangular"
              sx={{ height: 48, borderRadius: 'sm', mb: 1 }}
            />
          ))}
        </Box>
      </Sheet>
    </>
  );
}

// ─── Version row (inline in the accordion) ───────────────────────────────────

function VersionRow({
  v,
  updatingVersion,
  onSetTag,
  onClearTag,
  onDelete,
}: {
  v: VersionEntry;
  updatingVersion: string | null;
  onSetTag: (versionLabel: string, tag: string) => void;
  onClearTag: (versionLabel: string) => void;
  onDelete: (versionLabel: string) => void;
}) {
  return (
    <tr key={v.id}>
      {/* Name / title */}
      <td>
        <Tooltip title={v.description || v.asset_id}>
          <Typography level="body-sm" noWrap sx={{ maxWidth: 220 }}>
            {v.title || v.asset_id}
          </Typography>
        </Tooltip>
      </td>
      {/* Dataset ID */}
      <td>
        <Typography
          level="body-sm"
          fontFamily="monospace"
          noWrap
          sx={{ maxWidth: 200 }}
        >
          {v.asset_id}
        </Typography>
      </td>
      {/* Version */}
      <td>
        <Typography level="title-sm" fontFamily="monospace">
          {v.version_label}
        </Typography>
      </td>
      {/* Tag */}
      <td>
        {updatingVersion === v.version_label ? (
          <CircularProgress size="sm" />
        ) : v.tag ? (
          <Chip
            size="sm"
            color={TAG_COLORS[v.tag] || 'neutral'}
            variant="soft"
            endDecorator={
              <a
                size="sm"
                variant="plain"
                color="neutral"
                onClick={() => onClearTag(v.version_label)}
              >
                <XIcon size={12} />
              </a>
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
              if (val) onSetTag(v.version_label, val as string);
            }}
            sx={{ minWidth: 100 }}
          >
            <Option value="latest">latest</Option>
            <Option value="production">production</Option>
            <Option value="draft">draft</Option>
          </Select>
        )}
      </td>
      {/* Job */}
      <td>
        {v.job_id ? (
          <Tooltip title={`Job ${v.job_id}`}>
            <Chip size="sm" variant="outlined" color="neutral">
              &nbsp;{String(v.job_id).slice(0, 6)}
            </Chip>
          </Tooltip>
        ) : (
          <Typography level="body-xs" color="neutral">
            —
          </Typography>
        )}
      </td>
      {/* Created */}
      <td>
        <Typography level="body-xs">
          {v.created_at ? dayjs(v.created_at).fromNow() : '—'}
        </Typography>
      </td>
      {/* Delete */}
      <td style={{ textAlign: 'right' }}>
        <Trash2Icon
          size={18}
          color="var(--joy-palette-danger-600)"
          style={{ cursor: 'pointer', verticalAlign: 'middle' }}
          onClick={() => onDelete(v.version_label)}
        />
      </td>
    </tr>
  );
}

// ─── Expanded group versions table ───────────────────────────────────────────

function GroupVersionsTable({
  groupId,
  mutateGroups,
}: {
  groupId: string;
  mutateGroups: () => void;
}) {
  const [updatingVersion, setUpdatingVersion] = useState<string | null>(null);
  const assetType = 'dataset';

  const {
    data: versions,
    isLoading,
    mutate,
  } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListVersions(assetType, groupId),
    fetcher,
  );

  const handleSetTag = async (versionLabel: string, tag: string) => {
    setUpdatingVersion(versionLabel);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.SetTag(
          assetType,
          groupId,
          versionLabel,
        ),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        },
      );
      mutate();
      mutateGroups();
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
        chatAPI.Endpoints.AssetVersions.ClearTag(
          assetType,
          groupId,
          versionLabel,
        ),
        { method: 'DELETE' },
      );
      mutate();
      mutateGroups();
    } catch (error) {
      console.error('Failed to clear tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleDeleteVersion = async (versionLabel: string) => {
    if (
      !window.confirm(
        `Delete version ${versionLabel} from this group? This will not delete the underlying dataset.`,
      )
    ) {
      return;
    }
    setUpdatingVersion(versionLabel);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteVersion(
          assetType,
          groupId,
          versionLabel,
        ),
        { method: 'DELETE' },
      );
      mutate();
      mutateGroups();
    } catch (error) {
      console.error('Failed to delete version:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const versionList: VersionEntry[] = Array.isArray(versions) ? versions : [];

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size="sm" />
      </Box>
    );
  }

  if (versionList.length === 0) {
    return (
      <Typography
        level="body-sm"
        color="neutral"
        sx={{ py: 2, textAlign: 'center' }}
      >
        No versions in this group.
      </Typography>
    );
  }

  return (
    <Table size="sm" stickyHeader hoverRow>
      <thead>
        <tr>
          <th style={{ width: 200 }}>Name</th>
          <th style={{ width: 200 }}>Dataset ID</th>
          <th style={{ width: 70 }}>Version</th>
          <th style={{ width: 120 }}>Tag</th>
          <th style={{ width: 80 }}>Job</th>
          <th style={{ width: 90 }}>Created</th>
          <th style={{ width: 60 }}>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {versionList.map((v) => (
          <VersionRow
            key={v.id}
            v={v}
            updatingVersion={updatingVersion}
            onSetTag={handleSetTag}
            onClearTag={handleClearTag}
            onDelete={handleDeleteVersion}
          />
        ))}
      </tbody>
    </Table>
  );
}

// ─── Edit Group Modal ───────────────────────────────────────────────────────

function EditGroupModal({
  open,
  onClose,
  group,
  mutateGroups,
}: {
  open: boolean;
  onClose: () => void;
  group: GroupSummary;
  mutateGroups: () => void;
}) {
  const [name, setName] = useState(group.group_name);
  const [description, setDescription] = useState(group.description || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.UpdateGroup('dataset', group.group_id),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, description }),
        },
      );
      await mutateGroups();
      onClose();
    } catch (err) {
      console.error('Failed to update group:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 480 }}>
        <ModalClose />
        <DialogTitle>Edit Dataset Group</DialogTitle>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl>
            <FormLabel>Name</FormLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel>Description</FormLabel>
            <Textarea
              minRows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this dataset group…"
            />
          </FormControl>
          <Button loading={saving} onClick={handleSave}>
            Save
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function DatasetRegistry() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [editingGroup, setEditingGroup] = useState<GroupSummary | null>(null);
  const {
    data: groups,
    isLoading,
    isError,
    mutate: mutateGroups,
  } = useSWR(chatAPI.Endpoints.AssetVersions.ListGroups('dataset'), fetcher);

  const handleDeleteGroup = async (groupId: string, displayName: string) => {
    if (
      !window.confirm(
        `Delete group "${displayName}" and ALL its versions? The underlying datasets will not be deleted.`,
      )
    ) {
      return;
    }
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteGroup('dataset', groupId),
        { method: 'DELETE' },
      );
      mutateGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  if (isLoading) return <RegistrySkeleton />;
  if (isError) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="danger">
          Failed to load dataset registry groups.
        </Typography>
      </Box>
    );
  }

  const groupList: GroupSummary[] = Array.isArray(groups) ? groups : [];

  // Filter groups by search text
  const filteredGroups = groupList.filter((g) => {
    const search = searchText.toLowerCase();
    if (search && !g.group_name.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {/* ── Top bar: matches LocalModelsTable ── */}
      <Box
        className="SearchAndFilters-tabletUp"
        sx={{
          borderRadius: 'sm',
          pb: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          '& > *': {
            minWidth: {
              xs: '120px',
              md: '160px',
            },
          },
        }}
      >
        <FormControl sx={{ flex: 1 }} size="sm">
          <FormLabel>&nbsp;</FormLabel>
          <Input
            placeholder="Search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </FormControl>

        <FormControl size="sm">
          <FormLabel>&nbsp;</FormLabel>
          <IconButton
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={() => mutateGroups()}
            aria-label="Refresh datasets"
          >
            <RotateCcwIcon size="18px" />
            &nbsp; Refresh Datasets
          </IconButton>
        </FormControl>
      </Box>

      {/* ── Content ── */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {filteredGroups.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <DatabaseIcon size={48} color="gray" style={{ marginBottom: 16 }} />
            <Typography level="body-lg" color="neutral">
              {searchText
                ? 'No dataset groups match your search.'
                : 'No dataset groups yet.'}
            </Typography>
            {!searchText && (
              <Typography level="body-sm" color="neutral" sx={{ mt: 1 }}>
                Publish a dataset from a completed Job to create your first
                model.
              </Typography>
            )}
          </Box>
        ) : (
          <AccordionGroup
            sx={{
              borderRadius: 'md',
              [`& .MuiAccordion-root`]: {
                marginTop: '0.5rem',
                transition: '0.2s ease',
                '& button:not([aria-expanded="true"])': {
                  transition: '0.2s ease',
                  paddingBottom: '0.625rem',
                },
                '& button:hover': {
                  background: 'transparent',
                },
              },
            }}
          >
            {filteredGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.group_id);
              return (
                <Accordion
                  key={group.group_id}
                  expanded={isExpanded}
                  onChange={() => toggleGroup(group.group_id)}
                  sx={{
                    borderRadius: 'md',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <AccordionSummary
                    indicator={<ChevronDownIcon size={18} />}
                    sx={{ px: 2, py: 1.5 }}
                  >
                    <Stack
                      direction="row"
                      alignItems="flex-start"
                      gap={1.5}
                      sx={{ width: '100%', pr: 1 }}
                    >
                      <DatabaseIcon
                        size={18}
                        style={{ marginTop: 3, flexShrink: 0 }}
                      />

                      {/* Title + description */}
                      <Stack gap={0.25} sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" gap={1.5}>
                          <Typography level="title-md" fontWeight="lg">
                            {group.group_name}
                          </Typography>
                          <Chip size="sm" variant="soft" color="neutral">
                            {group.version_count} version
                            {group.version_count !== 1 ? 's' : ''}
                          </Chip>
                          {group.latest_tag && (
                            <Chip
                              size="sm"
                              variant="soft"
                              color={TAG_COLORS[group.latest_tag] || 'neutral'}
                            >
                              {group.latest_tag}
                            </Chip>
                          )}
                        </Stack>
                        {group.description && (
                          <Typography level="body-xs" color="neutral">
                            {group.description}
                          </Typography>
                        )}
                      </Stack>

                      {/* Edit + Delete icons */}
                      <Stack direction="row" gap={0.5} sx={{ flexShrink: 0 }}>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="neutral"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingGroup(group);
                          }}
                        >
                          <PencilIcon size={16} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(group.group_id, group.group_name);
                          }}
                        >
                          <Trash2Icon size={16} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </AccordionSummary>

                  <AccordionDetails sx={{ px: 2, pb: 2 }}>
                    {isExpanded && (
                      <GroupVersionsTable
                        groupId={group.group_id}
                        mutateGroups={mutateGroups}
                      />
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </AccordionGroup>
        )}
      </Box>

      {editingGroup && (
        <EditGroupModal
          key={editingGroup.group_id}
          open
          onClose={() => setEditingGroup(null)}
          group={editingGroup}
          mutateGroups={mutateGroups}
        />
      )}
    </Sheet>
  );
}
