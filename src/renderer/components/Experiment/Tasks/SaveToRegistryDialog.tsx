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

export interface SaveVersionInfo {
  /** The display name for the group (new name or existing display name) */
  groupName: string;
  /** The UUID group_id when adding to an existing group */
  groupId?: string;
  /** Unique name for the asset in the registry folder */
  assetName: string;
  /** 'new' = create a new group, 'existing' = add version to existing group */
  mode: 'new' | 'existing';
  /** Tag to assign to the new version */
  tag: string;
  /** User-defined version label (e.g. 'v1', 'march-run') */
  versionLabel: string;
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
  /** List of existing registry entry names for the "Add to existing" option */
  existingNames: string[];
  /** Whether the save is in progress */
  saving: boolean;
  /** Called when the user confirms the save */
  onSave: (info: SaveVersionInfo) => void;
  /** Job ID that produced this asset (optional, for display) */
  jobId?: string | number;
  /** External error message to display on the asset name field (e.g. name already exists) */
  assetNameError?: string | null;
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function SaveToRegistryDialog({
  open,
  onClose,
  sourceName,
  type,
  existingNames,
  saving,
  onSave,
  jobId,
  assetNameError: externalAssetNameError,
}: SaveToRegistryDialogProps) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState(sourceName);
  const [assetName, setAssetName] = useState(sourceName);
  const [assetNameError, setAssetNameError] = useState<string | null>(null);
  const [existingTarget, setExistingTarget] = useState<string | null>(null);
  const [tag, setTag] = useState<string>('latest');
  const [versionLabel, setVersionLabel] = useState('v1');
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
  const latestVersionLabel = selectedGroup?.latest_version_label ?? null;

  const getNextVersionLabel = (latestLabel: string | null): string => {
    if (!latestLabel) {
      return 'v1';
    }

    const match = latestLabel.match(/^(.*?)(\d+)$/);
    if (!match) {
      return `${latestLabel}-2`;
    }

    const prefix = match[1];
    const numericSuffix = Number(match[2]);
    return `${prefix}${numericSuffix + 1}`;
  };

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setMode('new');
      setNewName(sourceName);
      setAssetName(sourceName);
      setAssetNameError(null);
      setExistingTarget(null);
      setTag('latest');
      setVersionLabel('v1');
      setDescription('');
    }
  }, [open, sourceName]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === 'new') {
      setVersionLabel('v1');
      return;
    }

    if (mode === 'existing' && selectedGroup) {
      setVersionLabel(getNextVersionLabel(latestVersionLabel));
    }
  }, [open, mode, selectedGroup, latestVersionLabel]);

  // Sync external asset name error from parent (e.g. 409 conflict response)
  useEffect(() => {
    if (externalAssetNameError) {
      setAssetNameError(externalAssetNameError);
    }
  }, [externalAssetNameError]);

  const typeLabel = type === 'dataset' ? 'Dataset' : 'Model';

  const canSave =
    (mode === 'new'
      ? newName.trim().length > 0
      : existingTarget !== null && existingTarget.trim().length > 0) &&
    assetName.trim().length > 0;

  const handleSubmit = () => {
    if (!canSave) return;
    setAssetNameError(null);
    const groupName =
      mode === 'new'
        ? newName.trim()
        : (selectedGroup?.group_name ?? existingTarget!);
    onSave({
      groupName,
      groupId: mode === 'existing' ? existingTarget! : undefined,
      assetName: assetName.trim(),
      mode,
      tag,
      versionLabel: versionLabel.trim() || 'v1',
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
                      {selectedGroup.version_count !== 1 ? 's' : ''}
                      {latestVersionLabel
                        ? ` (latest: ${latestVersionLabel})`
                        : ''}
                      .
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
            {/* Asset name (unique folder name in the registry) */}
            <FormControl error={!!assetNameError}>
              <FormLabel>Version Name</FormLabel>
              <Input
                size="sm"
                value={assetName}
                onChange={(e) => {
                  setAssetName(e.target.value);
                  setAssetNameError(null);
                }}
                placeholder={`Unique name for this ${typeLabel.toLowerCase()}`}
                color={assetNameError ? 'danger' : undefined}
              />
              {assetNameError ? (
                <Typography level="body-xs" color="danger" sx={{ mt: 0.5 }}>
                  {assetNameError}
                </Typography>
              ) : (
                <Typography level="body-xs" color="neutral" sx={{ mt: 0.5 }}>
                  The unique folder name used to store the{' '}
                  {typeLabel.toLowerCase()} in the registry.
                </Typography>
              )}
            </FormControl>

            {/* Version label */}
            <FormControl>
              <FormLabel>Version Label</FormLabel>
              <Input
                size="sm"
                value={versionLabel}
                readOnly
                disabled
                placeholder="Auto-generated version label"
                sx={{ cursor: 'not-allowed' }}
              />
              <Typography level="body-xs" color="neutral" sx={{ mt: 0.5 }}>
                A system-generated label for this version.
              </Typography>
            </FormControl>

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
            Publish as {versionLabel || 'v1'}
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
