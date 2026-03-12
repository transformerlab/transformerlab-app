/**
 * DatasetRegistry.tsx
 *
 * Displays asset-version groups for datasets (from the asset_versions API).
 * Each group renders as an expandable card. Expanded cards show a versions table.
 * This is the "Dataset Registry" tab inside Data.
 */

import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Option,
  Select,
  Sheet,
  Skeleton,
  Stack,
  Table,
  Tooltip,
  Typography,
} from '@mui/joy';
import {
  CalendarIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DatabaseIcon,
  LayersIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VersionEntry {
  id: string;
  asset_type: string;
  group_name: string;
  version: number;
  asset_id: string;
  tag: string | null;
  job_id: string | null;
  description: string | null;
  title: string | null;
  long_description: string | null;
  cover_image: string | null;
  evals: Record<string, unknown> | null;
  extra_metadata: Record<string, unknown> | null;
  created_at: string | null;
}

interface GroupSummary {
  group_name: string;
  asset_type: string;
  version_count: number;
  latest_version: number;
  latest_tag: string | null;
  latest_created_at: string | null;
}

// ─── Tag colours ─────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, 'success' | 'primary' | 'warning' | 'neutral'> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

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

function formatRelativeDate(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  } catch {
    return isoString;
  }
}

// ─── Skeleton loader ─────────────────────────────────────────────────────────

function RegistrySkeleton() {
  return (
    <Box sx={{ p: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {[...Array(4)].map((_, i) => (
        <Skeleton
          key={i}
          variant="rectangular"
          width={320}
          height={120}
          sx={{ borderRadius: 12 }}
        />
      ))}
    </Box>
  );
}

// ─── Version row inside the expanded card ────────────────────────────────────

function VersionRow({
  v,
  updatingVersion,
  onSetTag,
  onClearTag,
  onDelete,
}: {
  v: VersionEntry;
  updatingVersion: number | null;
  onSetTag: (version: number, tag: string) => void;
  onClearTag: (version: number) => void;
  onDelete: (version: number) => void;
}) {
  return (
    <tr key={v.id}>
      <td>
        <Typography level="title-sm" fontFamily="monospace">
          v{v.version}
        </Typography>
      </td>
      <td>
        <Tooltip title={v.description || v.asset_id}>
          <Typography level="body-sm" noWrap sx={{ maxWidth: 180 }}>
            {v.asset_id}
          </Typography>
        </Tooltip>
      </td>
      <td>
        {updatingVersion === v.version ? (
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
                onClick={() => onClearTag(v.version)}
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
              if (val) onSetTag(v.version, val as string);
            }}
            sx={{ minWidth: 100 }}
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
          <Typography level="body-xs">{formatDate(v.created_at)}</Typography>
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
        <IconButton
          size="sm"
          variant="plain"
          color="danger"
          onClick={() => onDelete(v.version)}
          disabled={updatingVersion === v.version}
        >
          <Trash2Icon size={16} />
        </IconButton>
      </td>
    </tr>
  );
}

// ─── Expanded card versions table ────────────────────────────────────────────

function CardVersionsTable({
  groupName,
  mutateGroups,
}: {
  groupName: string;
  mutateGroups: () => void;
}) {
  const [updatingVersion, setUpdatingVersion] = useState<number | null>(null);
  const assetType = 'dataset';

  const {
    data: versions,
    isLoading,
    mutate,
  } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListVersions(assetType, groupName),
    fetcher,
  );

  const handleSetTag = async (version: number, tag: string) => {
    setUpdatingVersion(version);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.SetTag(assetType, groupName, version),
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

  const handleClearTag = async (version: number) => {
    setUpdatingVersion(version);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.ClearTag(assetType, groupName, version),
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

  const handleDeleteVersion = async (version: number) => {
    if (
      !window.confirm(
        `Delete version ${version} from group "${groupName}"? This will not delete the underlying dataset.`,
      )
    ) {
      return;
    }
    setUpdatingVersion(version);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteVersion(assetType, groupName, version),
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
      <Typography level="body-sm" color="neutral" sx={{ py: 2, textAlign: 'center' }}>
        No versions in this group.
      </Typography>
    );
  }

  return (
    <Table
      size="sm"
      sx={{
        '& thead th': { textAlign: 'left' },
        '& tbody td': { verticalAlign: 'middle' },
      }}
    >
      <thead>
        <tr>
          <th style={{ width: 70 }}>Version</th>
          <th style={{ width: 120 }}>Dataset ID</th>
          <th style={{ width: 110 }}>Tag</th>
          <th style={{ width: 150 }}>Created</th>
          <th style={{ width: 80 }}>Job</th>
          <th>Actions</th>
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

// ─── Single group card ───────────────────────────────────────────────────────

function GroupCard({
  group,
  isExpanded,
  onToggle,
  onDelete,
  mutateGroups,
}: {
  group: GroupSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  mutateGroups: () => void;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        width: '100%',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 'sm' },
      }}
    >
      <CardContent>
        {/* Header row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
          onClick={onToggle}
        >
          {/* Left: icon + name + badges */}
          <Stack direction="row" alignItems="center" gap={1.5}>
            <DatabaseIcon size={18} />
            <Typography level="title-md" fontWeight="lg">
              {group.group_name}
            </Typography>
            <Chip size="sm" variant="soft" color="neutral">
              {group.version_count} version{group.version_count !== 1 ? 's' : ''}
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

          {/* Right: last updated + actions + chevron */}
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography level="body-xs" color="neutral">
              {formatRelativeDate(group.latest_created_at)}
            </Typography>
            <Tooltip title="Delete group">
              <IconButton
                size="sm"
                variant="plain"
                color="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2Icon size={16} />
              </IconButton>
            </Tooltip>
            {isExpanded ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </Stack>
        </Box>

        {/* Expanded content: versions table */}
        {isExpanded && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <CardVersionsTable
              groupName={group.group_name}
              mutateGroups={mutateGroups}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function DatasetRegistry() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const {
    data: groups,
    isLoading,
    isError,
    mutate: mutateGroups,
  } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListGroups('dataset'),
    fetcher,
  );

  const handleDeleteGroup = async (groupName: string) => {
    if (
      !window.confirm(
        `Delete group "${groupName}" and ALL its versions? The underlying datasets will not be deleted.`,
      )
    ) {
      return;
    }
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteGroup('dataset', groupName),
        { method: 'DELETE' },
      );
      mutateGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  if (isLoading) return <RegistrySkeleton />;
  if (isError) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="danger">Failed to load dataset registry groups.</Typography>
      </Box>
    );
  }

  const groupList: GroupSummary[] = Array.isArray(groups) ? groups : [];

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
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2,
          py: 1.5,
        }}
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <LayersIcon size={20} />
          <Typography level="title-lg">Dataset Registry</Typography>
          <Chip size="sm" variant="soft" color="neutral">
            {groupList.length} group{groupList.length !== 1 ? 's' : ''}
          </Chip>
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
        {groupList.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <DatabaseIcon size={48} color="gray" style={{ marginBottom: 16 }} />
            <Typography level="body-lg" color="neutral">
              No dataset groups yet.
            </Typography>
            <Typography level="body-sm" color="neutral" sx={{ mt: 1 }}>
              Publish a dataset from the Jobs page to create your first group.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {groupList.map((group) => (
              <GroupCard
                key={group.group_name}
                group={group}
                isExpanded={expandedGroups.has(group.group_name)}
                onToggle={() => toggleGroup(group.group_name)}
                onDelete={() => handleDeleteGroup(group.group_name)}
                mutateGroups={mutateGroups}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Sheet>
  );
}
