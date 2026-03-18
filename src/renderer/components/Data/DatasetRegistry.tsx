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
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  DialogTitle,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  ModalClose,
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
  BriefcaseIcon,
  ChevronDownIcon,
  DatabaseIcon,
  InfoIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';

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
  group_name: string;
  asset_type: string;
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

// ─── Version Info Drawer ─────────────────────────────────────────────────────

function VersionInfoDrawer({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: VersionEntry | null;
}) {
  if (!entry) return null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      size="lg"
      slotProps={{
        content: {
          sx: {
            width: { xs: '100vw', sm: 540 },
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <Sheet sx={{ p: 2.5, pb: 1.5 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <DialogTitle>
            <Typography level="title-lg">
              Version Details: <b>{entry.version_label}</b>
            </Typography>
          </DialogTitle>
          <ModalClose />
        </Stack>
      </Sheet>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Stack spacing={2}>
          {/* Title */}
          {entry.title && (
            <Box>
              <Typography
                level="body-xs"
                textTransform="uppercase"
                fontWeight="lg"
                sx={{ mb: 0.5 }}
              >
                Title
              </Typography>
              <Typography level="body-md">{entry.title}</Typography>
            </Box>
          )}

          {/* Description */}
          {entry.description && (
            <Box>
              <Typography
                level="body-xs"
                textTransform="uppercase"
                fontWeight="lg"
                sx={{ mb: 0.5 }}
              >
                Description
              </Typography>
              <Typography level="body-sm">{entry.description}</Typography>
            </Box>
          )}

          {/* Long description (markdown) */}
          {entry.long_description && (
            <Box>
              <Typography
                level="body-xs"
                textTransform="uppercase"
                fontWeight="lg"
                sx={{ mb: 0.5 }}
              >
                Details
              </Typography>
              <Box sx={{ '& p': { margin: 0 }, '& img': { maxWidth: '100%' } }}>
                <Markdown>{entry.long_description}</Markdown>
              </Box>
            </Box>
          )}

          {/* Cover image */}
          {entry.cover_image && (
            <Box>
              <Typography
                level="body-xs"
                textTransform="uppercase"
                fontWeight="lg"
                sx={{ mb: 0.5 }}
              >
                Cover Image
              </Typography>
              <img
                src={entry.cover_image}
                alt="Cover"
                style={{ maxWidth: '100%', borderRadius: 8 }}
              />
            </Box>
          )}

          {/* Dataset ID */}
          <Box>
            <Typography
              level="body-xs"
              textTransform="uppercase"
              fontWeight="lg"
              sx={{ mb: 0.5 }}
            >
              Dataset ID
            </Typography>
            <Typography level="body-sm" fontFamily="monospace">
              {entry.asset_id}
            </Typography>
          </Box>

          {/* Tag */}
          <Box>
            <Typography
              level="body-xs"
              textTransform="uppercase"
              fontWeight="lg"
              sx={{ mb: 0.5 }}
            >
              Tag
            </Typography>
            {entry.tag ? (
              <Chip
                size="sm"
                color={TAG_COLORS[entry.tag] || 'neutral'}
                variant="soft"
              >
                {entry.tag}
              </Chip>
            ) : (
              <Typography level="body-sm" color="neutral">
                —
              </Typography>
            )}
          </Box>

          {/* Created */}
          <Box>
            <Typography
              level="body-xs"
              textTransform="uppercase"
              fontWeight="lg"
              sx={{ mb: 0.5 }}
            >
              Created
            </Typography>
            <Typography level="body-sm">
              {formatDate(entry.created_at)}
            </Typography>
          </Box>

          {/* Source Job */}
          <Box>
            <Typography
              level="body-xs"
              textTransform="uppercase"
              fontWeight="lg"
              sx={{ mb: 0.5 }}
            >
              Source Job
            </Typography>
            {entry.job_id ? (
              <Chip size="sm" variant="outlined" color="neutral">
                <BriefcaseIcon size={12} />
                &nbsp;Job {entry.job_id}
              </Chip>
            ) : (
              <Typography level="body-sm" color="neutral">
                —
              </Typography>
            )}
          </Box>

          {/* Evals */}
          {entry.evals && Object.keys(entry.evals).length > 0 && (
            <Box>
              <Typography
                level="body-xs"
                textTransform="uppercase"
                fontWeight="lg"
                sx={{ mb: 0.5 }}
              >
                Evaluations
              </Typography>
              <Table size="sm" sx={{ '& td, & th': { py: 0.5 } }}>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(entry.evals).map(([key, val]) => (
                    <tr key={key}>
                      <td>
                        <Typography level="body-sm" fontFamily="monospace">
                          {key}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{String(val)}</Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}

// ─── Version row (inline in the accordion) ───────────────────────────────────

function VersionRow({
  v,
  updatingVersion,
  onSetTag,
  onClearTag,
  onDelete,
  onInfo,
}: {
  v: VersionEntry;
  updatingVersion: string | null;
  onSetTag: (versionLabel: string, tag: string) => void;
  onClearTag: (versionLabel: string) => void;
  onDelete: (versionLabel: string) => void;
  onInfo: (version: VersionEntry) => void;
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
              <IconButton
                size="sm"
                variant="plain"
                color="neutral"
                onClick={() => onClearTag(v.version_label)}
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
      {/* Created */}
      <td>
        <Typography level="body-xs">
          {formatRelativeDate(v.created_at)}
        </Typography>
      </td>
      {/* Info + Delete (inline, no Actions header) */}
      <td style={{ textAlign: 'right' }}>
        <InfoIcon
          size={18}
          style={{ cursor: 'pointer', verticalAlign: 'middle' }}
          onClick={() => onInfo(v)}
        />
        &nbsp;
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
  groupName,
  mutateGroups,
  onOpenInfo,
}: {
  groupName: string;
  mutateGroups: () => void;
  onOpenInfo: (v: VersionEntry) => void;
}) {
  const [updatingVersion, setUpdatingVersion] = useState<string | null>(null);
  const assetType = 'dataset';

  const {
    data: versions,
    isLoading,
    mutate,
  } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListVersions(assetType, groupName),
    fetcher,
  );

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
        chatAPI.Endpoints.AssetVersions.ClearTag(assetType, groupName, versionLabel),
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
        `Delete version ${versionLabel} from group "${groupName}"? This will not delete the underlying dataset.`,
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
    <Table
      size="sm"
      stickyHeader
      hoverRow
      sx={{
        '--TableCell-headBackground': (theme: any) =>
          theme.vars.palette.background.level1,
        '--Table-headerUnderlineThickness': '1px',
        '--TableRow-hoverBackground': (theme: any) =>
          theme.vars.palette.background.level1,
        '& thead th': { textAlign: 'left' },
        '& tbody td': { verticalAlign: 'middle' },
      }}
    >
      <thead>
        <tr>
          <th style={{ width: 200, padding: 12 }}>Name</th>
          <th style={{ width: 200, padding: 12 }}>Dataset ID</th>
          <th style={{ width: 70, padding: 12 }}>Version</th>
          <th style={{ width: 120, padding: 12 }}>Tag</th>
          <th style={{ width: 80, padding: 12 }}>Job</th>
          <th style={{ width: 90, padding: 12 }}>Created</th>
          <th style={{ width: 60, padding: 12 }}> </th>
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
            onInfo={onOpenInfo}
          />
        ))}
      </tbody>
    </Table>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function DatasetRegistry() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [infoDrawerEntry, setInfoDrawerEntry] = useState<VersionEntry | null>(
    null,
  );

  const {
    data: groups,
    isLoading,
    isError,
    mutate: mutateGroups,
  } = useSWR(chatAPI.Endpoints.AssetVersions.ListGroups('dataset'), fetcher);

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
                Publish a dataset from the Jobs page to create your first group.
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
              const isExpanded = expandedGroups.has(group.group_name);
              return (
                <Accordion
                  key={group.group_name}
                  expanded={isExpanded}
                  onChange={() => toggleGroup(group.group_name)}
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
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        pr: 1,
                      }}
                    >
                      {/* Left side: Name + badges */}
                      <Stack direction="row" alignItems="center" gap={1.5}>
                        <DatabaseIcon size={18} />
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

                      {/* Right side: last updated */}
                      <Typography level="body-xs" color="neutral">
                        {formatRelativeDate(group.latest_created_at)}
                      </Typography>
                    </Box>
                  </AccordionSummary>

                  <AccordionDetails sx={{ px: 2, pb: 2 }}>
                    {isExpanded && (
                      <GroupVersionsTable
                        groupName={group.group_name}
                        mutateGroups={mutateGroups}
                        onOpenInfo={(v) => setInfoDrawerEntry(v)}
                      />
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </AccordionGroup>
        )}
      </Box>

      {/* ── Version Info Drawer ── */}
      <VersionInfoDrawer
        open={infoDrawerEntry !== null}
        onClose={() => setInfoDrawerEntry(null)}
        entry={infoDrawerEntry}
      />
    </Sheet>
  );
}
