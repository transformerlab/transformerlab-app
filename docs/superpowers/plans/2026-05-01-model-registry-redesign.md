# Model Registry Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the accordion-based `/zoo/registry` page with a tiny-card grid of model groups, and add a dedicated detail page per group at `/zoo/registry/:groupId` with Model Card / Versions tabs.

**Architecture:** Pure frontend refactor. Three new components (`ModelRegistryGrid`, `ModelGroupCard`, `ModelGroupDetail`) replace the body of the existing `ModelRegistry.tsx`. `ModelZoo.tsx` reads `useParams().groupId` to switch between list and detail. One new route added in `MainAppPanel.tsx`. No API changes.

**Tech Stack:** React + TypeScript, MUI Joy UI, `react-router-dom` `useParams`, SWR via `useSWRWithAuth`, `react-markdown` + `remark-gfm` (already in repo, see `src/renderer/components/Shared/AnnouncementBanner.tsx:6-7`), `lucide-react` icons, `dayjs` with `relativeTime` plugin.

**Spec:** `docs/superpowers/specs/2026-05-01-model-registry-redesign-design.md`

**Frontend test strategy:** This work is visual. After each task, verify in the browser using the `agent-browser` skill (per `CLAUDE.md` "Visual UI Verification"). The app must be running — assume `python scripts/dev.py` is up on `http://localhost:1212`. Login: `admin@example.com` / `admin123`. Always run `npm run format` on changed files before each commit.

**Reference data:**
- Endpoints: `src/renderer/lib/api-client/endpoints.ts:428-464` (`Endpoints.AssetVersions`).
- Existing list+accordion+modal+versions table: `src/renderer/components/ModelZoo/ModelRegistry.tsx` (will be largely replaced).
- Routing: `src/renderer/components/MainAppPanel.tsx:249`.
- `ModelZoo` shell: `src/renderer/components/ModelZoo/ModelZoo.tsx`.
- Markdown pattern: `src/renderer/components/Shared/AnnouncementBanner.tsx:6-7`.

---

## Task 1: Add detail route and switch ModelZoo on `groupId`

**Files:**
- Modify: `src/renderer/components/MainAppPanel.tsx:249`
- Modify: `src/renderer/components/ModelZoo/ModelZoo.tsx` (entire file)

- [ ] **Step 1: Add the detail route**

In `src/renderer/components/MainAppPanel.tsx`, immediately after the existing line:

```tsx
<Route path="/zoo/registry" element={<ModelZoo tab="registry" />} />
```

add:

```tsx
<Route
  path="/zoo/registry/:groupId"
  element={<ModelZoo tab="registry" />}
/>
```

- [ ] **Step 2: Update `ModelZoo` to switch list vs detail**

Replace the contents of `src/renderer/components/ModelZoo/ModelZoo.tsx` with:

```tsx
/* eslint-disable jsx-a11y/anchor-is-valid */
import { useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';
import { LayersIcon } from 'lucide-react';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { useNavigate, useParams } from 'react-router-dom';
import ModelRegistryGrid from './ModelRegistryGrid';
import ModelGroupDetail from './ModelGroupDetail';

export default function ModelZoo({ tab = 'store' }) {
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId?: string }>();

  useEffect(() => {
    if (tab !== 'registry') {
      navigate('/zoo/registry', { replace: true });
    }
  }, [tab, navigate]);

  return (
    <Sheet
      sx={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Tabs
        aria-label="Model Registry tabs"
        size="sm"
        sx={{
          borderRadius: 'lg',
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'unset',
        }}
        value="registry"
      >
        <TabList>
          <Tab value="registry">
            <LayersIcon size={16} color="grey" />
            &nbsp; Model Registry
          </Tab>
        </TabList>
        <TabPanel
          value="registry"
          sx={{
            p: 0,
            py: 1,
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          }}
        >
          {groupId ? (
            <ModelGroupDetail groupId={groupId} />
          ) : (
            <ModelRegistryGrid />
          )}
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
```

`ModelRegistryGrid` and `ModelGroupDetail` don't exist yet — the file will fail to compile until Task 3 and Task 5. That's expected; commit after Task 7.

- [ ] **Step 3: Verify the existing list still works in source navigation**

Don't run the app yet — the file references components that don't exist. Skip to Task 2.

---

## Task 2: Create `ModelGroupCard` component

**Files:**
- Create: `src/renderer/components/ModelZoo/ModelGroupCard.tsx`

- [ ] **Step 1: Define types and write the component**

```tsx
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/joy';
import { PackageIcon, PencilIcon, Trash2Icon } from 'lucide-react';

export interface GroupSummary {
  group_id: string;
  group_name: string;
  asset_type: string;
  description: string;
  version_count: number;
  latest_version_label: string | null;
  latest_tag: string | null;
  latest_created_at: string | null;
}

const TAG_COLORS: Record<
  string,
  'success' | 'primary' | 'warning' | 'neutral'
> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

interface ModelGroupCardProps {
  group: GroupSummary;
  onOpen: (groupId: string) => void;
  onEdit: (group: GroupSummary) => void;
  onDelete: (group: GroupSummary) => void;
}

export default function ModelGroupCard({
  group,
  onOpen,
  onEdit,
  onDelete,
}: ModelGroupCardProps) {
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(group);
  };
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(group);
  };

  return (
    <Box
      onClick={() => onOpen(group.group_id)}
      sx={{
        position: 'relative',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'md',
        p: 1.5,
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
        '&:hover': {
          borderColor: 'primary.outlinedBorder',
          background: 'background.level1',
        },
        '&:hover .ModelGroupCard-actions': { opacity: 1 },
      }}
    >
      <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
        <PackageIcon size={16} style={{ flexShrink: 0 }} />
        <Typography
          level="title-sm"
          fontWeight="lg"
          noWrap
          sx={{ flex: 1, minWidth: 0 }}
        >
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

      {group.description && (
        <Tooltip title={group.description} placement="top">
          <Typography
            level="body-xs"
            color="neutral"
            noWrap
            sx={{ mt: 0.5 }}
          >
            {group.description}
          </Typography>
        </Tooltip>
      )}

      <Stack
        direction="row"
        gap={0.5}
        className="ModelGroupCard-actions"
        sx={{
          position: 'absolute',
          top: 6,
          right: 6,
          opacity: 0,
          transition: 'opacity 0.15s ease',
          background: 'background.surface',
          borderRadius: 'sm',
        }}
      >
        <IconButton
          size="sm"
          variant="plain"
          color="neutral"
          onClick={handleEdit}
          aria-label="Edit model group"
        >
          <PencilIcon size={14} />
        </IconButton>
        <IconButton
          size="sm"
          variant="plain"
          color="danger"
          onClick={handleDelete}
          aria-label="Delete model group"
        >
          <Trash2Icon size={14} />
        </IconButton>
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: Format**

```bash
cd /Users/ali/workspace/transformerlab-app2 && npm run format
```

Expected: no errors; the new file gets reformatted.

---

## Task 3: Create `ModelRegistryGrid` (list replacement)

**Files:**
- Create: `src/renderer/components/ModelZoo/ModelRegistryGrid.tsx`

The grid owns: search/filter state, the groups query, the delete-confirm flow, the edit-modal state, and rendering the card grid + skeleton + empty + error states. The edit modal logic is lifted from the current `ModelRegistry.tsx` (`EditGroupModal` definition at lines 441-502) and inlined here.

- [ ] **Step 1: Write the file**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
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
  Textarea,
  Typography,
} from '@mui/joy';
import { PackageIcon, RotateCcwIcon, SearchIcon } from 'lucide-react';
import {
  useSWRWithAuth as useSWR,
  fetchWithAuth,
} from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';
import { licenseTypes, modelTypes } from '../../lib/utils';
import ModelGroupCard, { GroupSummary } from './ModelGroupCard';

function GridSkeleton() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 1.5,
      }}
    >
      {[...Array(8)].map((_, i) => (
        <Skeleton
          key={i}
          variant="rectangular"
          sx={{ height: 64, borderRadius: 'md' }}
        />
      ))}
    </Box>
  );
}

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
        chatAPI.Endpoints.AssetVersions.UpdateGroup('model', group.group_id),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
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
        <DialogTitle>Edit Model Group</DialogTitle>
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
              placeholder="Describe this model group…"
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

export default function ModelRegistryGrid() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editingGroup, setEditingGroup] = useState<GroupSummary | null>(null);

  const {
    data: groups,
    isLoading,
    isError,
    mutate: mutateGroups,
  } = useSWR(chatAPI.Endpoints.AssetVersions.ListGroups('model'), fetcher);

  const handleDeleteGroup = async (group: GroupSummary) => {
    if (
      !window.confirm(
        `Delete group "${group.group_name}" and ALL its versions? The underlying models will not be deleted.`,
      )
    ) {
      return;
    }
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteGroup('model', group.group_id),
        { method: 'DELETE' },
      );
      mutateGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const groupList: GroupSummary[] = Array.isArray(groups) ? groups : [];
  const filteredGroups = groupList.filter((g) => {
    const search = searchText.toLowerCase();
    if (search && !g.group_name.toLowerCase().includes(search)) return false;
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
      {/* Top bar — single aligned row, no &nbsp; label hack */}
      <Stack
        direction="row"
        alignItems="flex-end"
        gap={1.5}
        sx={{ pb: 2, flexWrap: 'wrap' }}
      >
        <FormControl size="sm" sx={{ flex: 1, minWidth: 200 }}>
          <FormLabel>Search</FormLabel>
          <Input
            placeholder="Search by name"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </FormControl>

        <FormControl size="sm" sx={{ minWidth: 160 }}>
          <FormLabel>License</FormLabel>
          <Select
            placeholder="Filter by license"
            slotProps={{ button: { sx: { whiteSpace: 'nowrap' } } }}
            value={filters?.license}
            disabled
            onChange={(_e, newValue) =>
              setFilters({ ...filters, license: newValue as string })
            }
          >
            {licenseTypes.map((type) => (
              <Option value={type} key={type}>
                {type}
              </Option>
            ))}
          </Select>
        </FormControl>

        <FormControl size="sm" sx={{ minWidth: 160 }}>
          <FormLabel>Architecture</FormLabel>
          <Select
            placeholder="All"
            disabled
            value={filters?.architecture}
            onChange={(_e, newValue) =>
              setFilters({ ...filters, architecture: newValue as string })
            }
          >
            {modelTypes.map((type) => (
              <Option value={type} key={type}>
                {type}
              </Option>
            ))}
          </Select>
        </FormControl>

        <IconButton
          variant="outlined"
          color="neutral"
          size="sm"
          onClick={() => mutateGroups()}
          aria-label="Refresh models"
          sx={{ height: 32 }}
        >
          <RotateCcwIcon size={16} />
          &nbsp; Refresh
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {isLoading ? (
          <GridSkeleton />
        ) : isError ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="danger">
              Failed to load model registry groups.
            </Typography>
          </Box>
        ) : filteredGroups.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <PackageIcon size={48} color="gray" style={{ marginBottom: 16 }} />
            <Typography level="body-lg" color="neutral">
              {searchText
                ? 'No model groups match your search.'
                : 'No model groups yet.'}
            </Typography>
            {!searchText && (
              <Typography level="body-sm" color="neutral" sx={{ mt: 1 }}>
                Publish a model from a completed Job to create your first
                model.
              </Typography>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 1.5,
            }}
          >
            {filteredGroups.map((group) => (
              <ModelGroupCard
                key={group.group_id}
                group={group}
                onOpen={(id) => navigate(`/zoo/registry/${id}`)}
                onEdit={(g) => setEditingGroup(g)}
                onDelete={handleDeleteGroup}
              />
            ))}
          </Box>
        )}
      </Box>

      {editingGroup && (
        <EditGroupModal
          open
          onClose={() => setEditingGroup(null)}
          group={editingGroup}
          mutateGroups={mutateGroups}
        />
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: Format**

```bash
cd /Users/ali/workspace/transformerlab-app2 && npm run format
```

---

## Task 4: Create `ModelGroupVersionsTable` (extracted, trimmed)

**Files:**
- Create: `src/renderer/components/ModelZoo/ModelGroupVersionsTable.tsx`

Extract the versions table from current `ModelRegistry.tsx` (the `GroupVersionsTable` and `VersionRow` functions, lines 162-437). Drop the per-row "Name" column.

- [ ] **Step 1: Write the file**

```tsx
import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Option,
  Select,
  Table,
  Tooltip,
  Typography,
} from '@mui/joy';
import { BriefcaseIcon, Trash2Icon, XIcon } from 'lucide-react';
import {
  useSWRWithAuth as useSWR,
  fetchWithAuth,
} from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';

dayjs.extend(relativeTime);

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

const TAG_COLORS: Record<
  string,
  'success' | 'primary' | 'warning' | 'neutral'
> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

interface ModelGroupVersionsTableProps {
  groupId: string;
  assetType: string;
  onAfterMutation?: () => void;
}

export default function ModelGroupVersionsTable({
  groupId,
  assetType,
  onAfterMutation,
}: ModelGroupVersionsTableProps) {
  const [updatingVersion, setUpdatingVersion] = useState<string | null>(null);
  const {
    data: versions,
    isLoading,
    mutate,
  } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListVersions(assetType, groupId),
    fetcher,
  );

  const afterMutation = () => {
    mutate();
    onAfterMutation?.();
  };

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
      afterMutation();
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
      afterMutation();
    } catch (error) {
      console.error('Failed to clear tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleDeleteVersion = async (versionLabel: string) => {
    if (
      !window.confirm(
        `Delete version ${versionLabel} from this group? This will not delete the underlying model.`,
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
      afterMutation();
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
          <th style={{ width: 90 }}>Version</th>
          <th style={{ width: 140 }}>Tag</th>
          <th style={{ width: 140 }}>Architecture</th>
          <th style={{ width: 80 }}>Params</th>
          <th style={{ width: 80 }}>Job</th>
          <th style={{ width: 110 }}>Created</th>
          <th style={{ width: 60 }}>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {versionList.map((v) => (
          <tr key={v.id}>
            <td>
              <Tooltip title={`Model ID: ${v.asset_id}`} placement="right">
                <Typography level="title-sm" fontFamily="monospace">
                  {v.version_label}
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
                      onClick={() => handleClearTag(v.version_label)}
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
                >
                  <Option value="latest">latest</Option>
                  <Option value="production">production</Option>
                  <Option value="draft">draft</Option>
                </Select>
              )}
            </td>
            <td>
              <Typography level="body-sm">
                {(v.metadata as any)?.architecture || '—'}
              </Typography>
            </td>
            <td>
              <Typography level="body-sm">
                {(v.metadata as any)?.parameters || '—'}
              </Typography>
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
              <Typography level="body-xs">
                {v.created_at ? dayjs(v.created_at).fromNow() : '—'}
              </Typography>
            </td>
            <td style={{ textAlign: 'right' }}>
              <Trash2Icon
                size={18}
                color="var(--joy-palette-danger-600)"
                style={{ cursor: 'pointer', verticalAlign: 'middle' }}
                onClick={() => handleDeleteVersion(v.version_label)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
```

- [ ] **Step 2: Format**

```bash
cd /Users/ali/workspace/transformerlab-app2 && npm run format
```

---

## Task 5: Create `ModelGroupDetail` (header + tabs)

**Files:**
- Create: `src/renderer/components/ModelZoo/ModelGroupDetail.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useNavigate } from 'react-router-dom';
import {
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
  Sheet,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  Typography,
} from '@mui/joy';
import {
  ChevronLeftIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useSWRWithAuth as useSWR,
  fetchWithAuth,
} from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';
import ModelGroupVersionsTable from './ModelGroupVersionsTable';
import { GroupSummary } from './ModelGroupCard';

dayjs.extend(relativeTime);

const TAG_COLORS: Record<
  string,
  'success' | 'primary' | 'warning' | 'neutral'
> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

interface VersionEntry {
  version_label: string;
  long_description: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  tag: string | null;
}

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
        chatAPI.Endpoints.AssetVersions.UpdateGroup('model', group.group_id),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
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
        <DialogTitle>Edit Model Group</DialogTitle>
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
              placeholder="Describe this model group…"
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

interface ModelGroupDetailProps {
  groupId: string;
}

export default function ModelGroupDetail({ groupId }: ModelGroupDetailProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'card' | 'versions'>('card');
  const [editing, setEditing] = useState(false);

  const {
    data: groups,
    isLoading: groupsLoading,
    mutate: mutateGroups,
  } = useSWR(chatAPI.Endpoints.AssetVersions.ListGroups('model'), fetcher);

  const { data: versions, isLoading: versionsLoading } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListVersions('model', groupId),
    fetcher,
  );

  const group: GroupSummary | undefined = useMemo(() => {
    if (!Array.isArray(groups)) return undefined;
    return (groups as GroupSummary[]).find((g) => g.group_id === groupId);
  }, [groups, groupId]);

  const latestVersion: VersionEntry | undefined = useMemo(() => {
    if (!Array.isArray(versions)) return undefined;
    const list = versions as VersionEntry[];
    return (
      list.find((v) => v.tag === 'latest') ||
      list[0]
    );
  }, [versions]);

  const handleDelete = async () => {
    if (!group) return;
    if (
      !window.confirm(
        `Delete group "${group.group_name}" and ALL its versions? The underlying models will not be deleted.`,
      )
    ) {
      return;
    }
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteGroup('model', group.group_id),
        { method: 'DELETE' },
      );
      navigate('/zoo/registry');
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  if (groupsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!group) {
    return (
      <Box sx={{ p: 3 }}>
        <Button
          variant="plain"
          startDecorator={<ChevronLeftIcon size={16} />}
          onClick={() => navigate('/zoo/registry')}
        >
          Registry
        </Button>
        <Typography level="body-lg" color="neutral" sx={{ mt: 2 }}>
          Model group not found.
        </Typography>
      </Box>
    );
  }

  const meta = (latestVersion?.metadata as any) || {};
  const metaPills: Array<{ label: string; value: string }> = [];
  if (meta.architecture) {
    metaPills.push({ label: 'Architecture', value: String(meta.architecture) });
  }
  if (meta.parameters) {
    metaPills.push({ label: 'Params', value: String(meta.parameters) });
  }
  if (meta.license) {
    metaPills.push({ label: 'License', value: String(meta.license) });
  }

  const cardMarkdown =
    latestVersion?.long_description ||
    latestVersion?.description ||
    group.description ||
    '';

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
      <Box sx={{ pb: 2 }}>
        <Button
          variant="plain"
          color="neutral"
          size="sm"
          startDecorator={<ChevronLeftIcon size={16} />}
          onClick={() => navigate('/zoo/registry')}
          sx={{ ml: -1, mb: 1 }}
        >
          Registry
        </Button>

        <Stack direction="row" alignItems="flex-start" gap={2}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level="h3" sx={{ mb: 0.5 }}>
              {group.group_name}
            </Typography>
            {group.description && (
              <Typography level="body-sm" color="neutral">
                {group.description}
              </Typography>
            )}
          </Box>
          <Stack direction="row" alignItems="center" gap={1}>
            {group.latest_tag && (
              <Chip
                size="sm"
                variant="soft"
                color={TAG_COLORS[group.latest_tag] || 'neutral'}
              >
                {group.latest_tag}
              </Chip>
            )}
            <Chip size="sm" variant="soft" color="neutral">
              {group.version_count} version
              {group.version_count !== 1 ? 's' : ''}
            </Chip>
            {group.latest_created_at && (
              <Typography level="body-xs" color="neutral">
                Updated {dayjs(group.latest_created_at).fromNow()}
              </Typography>
            )}
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              onClick={() => setEditing(true)}
              aria-label="Edit model group"
            >
              <PencilIcon size={16} />
            </IconButton>
            <IconButton
              size="sm"
              variant="plain"
              color="danger"
              onClick={handleDelete}
              aria-label="Delete model group"
            >
              <Trash2Icon size={16} />
            </IconButton>
          </Stack>
        </Stack>

        {metaPills.length > 0 && (
          <Stack direction="row" gap={0.75} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
            {metaPills.map((p) => (
              <Chip key={p.label} size="sm" variant="outlined" color="neutral">
                {p.label}: {p.value}
              </Chip>
            ))}
          </Stack>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_e, val) => setActiveTab(val as 'card' | 'versions')}
        sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        <TabList>
          <Tab value="card">Model Card</Tab>
          <Tab value="versions">Versions</Tab>
        </TabList>

        <TabPanel
          value="card"
          sx={{ flex: 1, overflow: 'auto', px: 0, pt: 2 }}
        >
          {versionsLoading ? (
            <CircularProgress size="sm" />
          ) : cardMarkdown ? (
            <Box sx={{ '& p': { my: 1 }, '& h1, & h2, & h3': { mt: 2 } }}>
              <Markdown remarkPlugins={[remarkGfm]}>{cardMarkdown}</Markdown>
            </Box>
          ) : (
            <Typography level="body-sm" color="neutral">
              No model card yet. Add a description with the edit button above,
              or a version with a long description.
            </Typography>
          )}
        </TabPanel>

        <TabPanel
          value="versions"
          sx={{ flex: 1, overflow: 'auto', px: 0, pt: 2 }}
        >
          <ModelGroupVersionsTable
            groupId={group.group_id}
            assetType="model"
            onAfterMutation={mutateGroups}
          />
        </TabPanel>
      </Tabs>

      {editing && (
        <EditGroupModal
          open
          onClose={() => setEditing(false)}
          group={group}
          mutateGroups={mutateGroups}
        />
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: Format**

```bash
cd /Users/ali/workspace/transformerlab-app2 && npm run format
```

---

## Task 6: Delete the old `ModelRegistry.tsx`

**Files:**
- Delete: `src/renderer/components/ModelZoo/ModelRegistry.tsx`

The old file is no longer imported (`ModelZoo.tsx` was switched to import `ModelRegistryGrid` and `ModelGroupDetail` in Task 1).

- [ ] **Step 1: Delete the file**

```bash
rm /Users/ali/workspace/transformerlab-app2/src/renderer/components/ModelZoo/ModelRegistry.tsx
```

- [ ] **Step 2: Confirm there are no remaining imports**

```bash
cd /Users/ali/workspace/transformerlab-app2 && grep -rn "ModelZoo/ModelRegistry'" src/ || echo "no remaining imports"
```

Expected: `no remaining imports`. If anything is found, follow the imports and update them — likely a missed file.

---

## Task 7: Verify the app compiles, lint passes, and visually check

- [ ] **Step 1: Run the formatter on all changed files**

```bash
cd /Users/ali/workspace/transformerlab-app2 && npm run format
```

- [ ] **Step 2: Type-check by running the test suite (catches TS errors fast)**

```bash
cd /Users/ali/workspace/transformerlab-app2 && npm test -- --watchAll=false 2>&1 | tail -40
```

Expected: tests pass (or are unaffected). If there are TS compile errors, fix them before continuing.

- [ ] **Step 3: Confirm the dev server is running**

If not already running, start it: `python /Users/ali/workspace/transformerlab-app2/scripts/dev.py`

Wait for the frontend to come up at `http://localhost:1212`.

- [ ] **Step 4: Visual verification with `agent-browser`**

Use the `agent-browser` skill (per `CLAUDE.md` "Visual UI Verification") to:

1. Navigate to `http://localhost:1212/#/zoo/registry`. Log in with `admin@example.com` / `admin123` if prompted.
2. Confirm: top bar's four controls are aligned on a single row (no `&nbsp;` gap above the search input).
3. Confirm: groups are rendered as a card grid; each card shows name + version-count chip + latest-tag chip on row 1, description on row 2.
4. Hover a card; confirm pencil + trash icons fade in top-right.
5. Click a card body; confirm URL becomes `/zoo/registry/<groupId>` and the detail page renders with header (back button, title, description, metadata pills if present, action icons).
6. Confirm the **Model Card** tab is selected by default and renders markdown (or the "No model card yet" stub).
7. Click **Versions**; confirm the trimmed table (Version, Tag, Architecture, Params, Job, Created, delete) appears. Hover a Version cell to see the Model ID tooltip.
8. Click the back button; confirm return to `/zoo/registry`.
9. Take screenshots of: the list page, the detail page Model Card tab, the detail page Versions tab. Save references for the PR description.

If anything is misaligned or broken, fix in place before committing.

- [ ] **Step 5: Commit everything**

```bash
cd /Users/ali/workspace/transformerlab-app2
git add src/renderer/components/MainAppPanel.tsx \
        src/renderer/components/ModelZoo/ModelZoo.tsx \
        src/renderer/components/ModelZoo/ModelGroupCard.tsx \
        src/renderer/components/ModelZoo/ModelRegistryGrid.tsx \
        src/renderer/components/ModelZoo/ModelGroupVersionsTable.tsx \
        src/renderer/components/ModelZoo/ModelGroupDetail.tsx
git rm src/renderer/components/ModelZoo/ModelRegistry.tsx 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(zoo): redesign model registry as card grid + per-model detail page

- /zoo/registry now shows a tiny-card grid of model groups (two rows
  per card: name + chips on row 1, description on row 2; edit/delete
  on hover).
- /zoo/registry/:groupId is a new detail page with a header
  (back button, title, description, metadata pills, edit/delete) and
  Model Card / Versions tabs.
- Versions table dropped the redundant "Name" column; Model ID moved
  to a tooltip on the Version cell.
- Top-bar alignment fixed (no more &nbsp; FormLabel hack).
- Splits the old ModelRegistry.tsx into ModelRegistryGrid,
  ModelGroupCard, ModelGroupVersionsTable, ModelGroupDetail.
EOF
)"
```

---

## Self-review (already performed by plan author)

**Spec coverage:**
- Routing → Task 1 ✓
- Top bar alignment fix → Task 3 (single `Stack`, no `&nbsp;` labels) ✓
- Card grid + tiny card layout → Tasks 2 & 3 ✓
- Hover edit/delete with `stopPropagation` → Task 2 ✓
- Detail page header (back, title, description, chips, edit, delete, metadata pills) → Task 5 ✓
- Tabs (Model Card markdown + Versions table) → Task 5 ✓
- Versions table trimmed (no Name column, Model ID in tooltip) → Task 4 ✓
- File structure (3 new components, modified ModelZoo + MainAppPanel, replaced ModelRegistry) → matches spec ✓
- Out-of-scope items (filters, raw files, URL tab sync) → not implemented, as intended ✓

**Placeholder scan:** none.

**Type consistency:** `GroupSummary` defined once in `ModelGroupCard.tsx` and reused via import in `ModelRegistryGrid` and `ModelGroupDetail`. `VersionEntry` is local to each file that needs it (table reads metadata; detail only needs a couple of fields). Endpoint helper signatures (`assetType, groupId, versionLabel`) match the SDK exactly (verified against `endpoints.ts:428-464`).

**Note for executor:** the legacy `ModelRegistry.tsx` is deleted in Task 6 *after* `ModelZoo.tsx` has been switched to import the new components in Task 1. The repo will not compile cleanly between Task 1 and Task 5 — this is expected. Don't attempt to run the dev server until Task 7.
