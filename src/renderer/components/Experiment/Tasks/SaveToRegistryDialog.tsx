import { useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  ModalClose,
  Button,
  Stack,
  FormControl,
  FormLabel,
  Input,
  RadioGroup,
  Radio,
  Autocomplete,
  Box,
  Chip,
  Divider,
  Option,
  Select,
  Textarea,
} from '@mui/joy';
import { LayersIcon, Save, TagIcon } from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { fetcher } from '../../../lib/transformerlab-api-sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GroupSummary {
  group_id: string;
  group_name: string;
  asset_type: string;
  version_count: number;
  latest_version_label: string | null;
}

interface GroupVersionEntry {
  version_label: string;
}

export interface SaveVersionInfo {
  /** The display name for the group (new name or existing display name) */
  groupName: string;
  /** The UUID group_id when adding to an existing group */
  groupId?: string;
  /** 'new' = create a new group, 'existing' = add version to existing group */
  mode: 'new' | 'existing';
  /** Tag to assign to the new version */
  tag: string;
  /** Human-readable description for the version */
  description: string;
}

interface SaveToRegistryDialogProps {
  open: boolean;
  onClose: () => void;
  /** The original name from the job (used as default for "Save as new") */
  sourceName: string;
  /** 'dataset' or 'model' — used for labels */
  type: 'dataset' | 'model';
  /** Whether the save is in progress */
  saving: boolean;
  /** Called when the user confirms the save */
  onSave: (info: SaveVersionInfo) => void;
  /** Job ID that produced this asset (optional, for display) */
  jobId?: string | number;
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

const getNextVersionLabel = (
  group: GroupSummary | null,
  groupVersions?: GroupVersionEntry[],
): string => {
  if (!group) return 'v1';

  let highestVersion = 0;
  for (const entry of groupVersions ?? []) {
    const versionMatch = entry.version_label.match(/^v(\d+)$/i);
    if (versionMatch) {
      highestVersion = Math.max(highestVersion, Number(versionMatch[1]));
    }
  }
  if (highestVersion > 0) {
    return `v${highestVersion + 1}`;
  }

  return `v${(group.version_count ?? 0) + 1}`;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SaveToRegistryDialog({
  open,
  onClose,
  sourceName,
  type,
  saving,
  onSave,
  jobId,
}: SaveToRegistryDialogProps) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState(sourceName);
  const [existingTarget, setExistingTarget] = useState<string | null>(null);
  const [tag, setTag] = useState<string>('latest');
  const [description, setDescription] = useState('');

  // Fetch existing groups from asset_versions API
  const { data: groupsData } = useSWR(
    open ? chatAPI.Endpoints.AssetVersions.ListGroups(type) : null,
    fetcher,
  );
  const groups: GroupSummary[] = Array.isArray(groupsData) ? groupsData : [];
  const groupNames = groups.map((g) => g.group_name);

  // Find selected group info for "next version" display (existingTarget stores group_id)
  const selectedGroup =
    mode === 'existing' && existingTarget
      ? groups.find((g) => g.group_id === existingTarget)
      : null;
  const { data: selectedGroupVersionsData } = useSWR(
    mode === 'existing' && selectedGroup
      ? chatAPI.Endpoints.AssetVersions.ListVersions(
          type,
          selectedGroup.group_id,
        )
      : null,
    fetcher,
  );
  const selectedGroupVersions: GroupVersionEntry[] = Array.isArray(
    selectedGroupVersionsData,
  )
    ? selectedGroupVersionsData
    : [];
  const nextVersionLabel =
    mode === 'new'
      ? 'v1'
      : getNextVersionLabel(selectedGroup, selectedGroupVersions);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setMode('new');
      setNewName(sourceName);
      setExistingTarget(null);
      setTag('latest');
      setDescription('');
    }
  }, [open, sourceName]);

  const typeLabel = type === 'dataset' ? 'Dataset' : 'Model';

  const canSave =
    mode === 'new'
      ? newName.trim().length > 0
      : existingTarget !== null && existingTarget.trim().length > 0;

  const handleSubmit = () => {
    if (!canSave) return;
    const groupName =
      mode === 'new'
        ? newName.trim()
        : (selectedGroup?.group_name ?? existingTarget!);
    onSave({
      groupName,
      groupId: mode === 'existing' ? existingTarget! : undefined,
      mode,
      tag,
      description:
        description.trim() || `Created from job ${jobId ?? 'unknown'}`,
    });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: {
            xs: 'calc(100vw - 2rem)',
            sm: 'min(640px, calc(100vw - 2rem))',
          },
          maxWidth: 'calc(100vw - 2rem)',
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
        }}
      >
        <ModalClose />
        <DialogTitle>
          <Stack direction="row" alignItems="center" gap={1}>
            <LayersIcon size={20} />
            Publish {typeLabel} to Registry
          </Stack>
        </DialogTitle>
        <Typography level="body-sm">
          Publish <strong>{sourceName}</strong> as a new versioned entry in the{' '}
          {typeLabel.toLowerCase()} registry.
        </Typography>
        <DialogContent sx={{ overflow: 'auto' }}>
          {/* ── Group selection ── */}
          <RadioGroup
            value={mode}
            onChange={(e) => setMode(e.target.value as 'new' | 'existing')}
            sx={{ gap: 2 }}
          >
            {/* Option 1: Create new group */}
            <Box>
              <Radio value="new" label={`Create new ${typeLabel}`} />
              {mode === 'new' && (
                <FormControl sx={{ ml: 4, mt: 1 }}>
                  <FormLabel>Name</FormLabel>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`e.g. my-${typeLabel.toLowerCase()}`}
                    autoFocus
                  />
                </FormControl>
              )}
            </Box>

            {/* Option 2: Add version to existing group */}
            <Box>
              <Radio
                value="existing"
                label={`Add as version to existing ${typeLabel}`}
                disabled={groupNames.length === 0}
              />
              {mode === 'existing' && (
                <FormControl sx={{ ml: 4, mt: 1 }}>
                  <Autocomplete
                    options={groups}
                    getOptionLabel={(option) =>
                      typeof option === 'string' ? option : option.group_name
                    }
                    isOptionEqualToValue={(option, value) =>
                      option.group_id === value.group_id
                    }
                    value={selectedGroup ?? null}
                    onChange={(_e, value) =>
                      setExistingTarget(value ? value.group_id : null)
                    }
                    placeholder={`Search ${typeLabel.toLowerCase()}s…`}
                    autoFocus
                  />
                  {selectedGroup && (
                    <Typography
                      level="body-xs"
                      color="neutral"
                      sx={{ mt: 0.5 }}
                    >
                      Currently has {selectedGroup.version_count} version
                      {selectedGroup.version_count !== 1 ? 's' : ''}. Next
                      version will be <strong>{nextVersionLabel}</strong>.
                    </Typography>
                  )}
                </FormControl>
              )}
            </Box>
          </RadioGroup>

          <Divider sx={{ my: 2 }} />

          {/* ── Version metadata ── */}
          <Typography
            level="body-xs"
            textTransform="uppercase"
            fontWeight="lg"
            sx={{ mb: 1 }}
          >
            Version Details
          </Typography>

          <Stack spacing={2}>
            {/* Tag selector */}
            <FormControl>
              <FormLabel>
                <Stack direction="row" alignItems="center" gap={0.5}>
                  <TagIcon size={14} />
                  Tag
                </Stack>
              </FormLabel>
              <Select
                size="sm"
                value={tag}
                onChange={(_e, val) => {
                  if (val) setTag(val);
                }}
                renderValue={(selected) => (
                  <Chip
                    size="sm"
                    variant="soft"
                    color={TAG_COLORS[selected?.value ?? ''] || 'neutral'}
                  >
                    {selected?.label}
                  </Chip>
                )}
              >
                {TAG_OPTIONS.map((t) => (
                  <Option key={t} value={t}>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={TAG_COLORS[t] || 'neutral'}
                    >
                      {t}
                    </Chip>
                  </Option>
                ))}
              </Select>
              <Typography level="body-xs" color="neutral" sx={{ mt: 0.5 }}>
                Selecting this tag will move it from any version that currently
                has it.
              </Typography>
            </FormControl>

            {/* Description */}
            <FormControl>
              <FormLabel>Description</FormLabel>
              <Textarea
                size="sm"
                minRows={2}
                maxRows={4}
                placeholder="What changed in this version?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            startDecorator={<Save size={16} />}
            onClick={handleSubmit}
            loading={saving}
            disabled={!canSave}
          >
            Publish as {nextVersionLabel}
          </Button>
          <Button
            variant="plain"
            color="neutral"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
