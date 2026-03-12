import { useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
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
  group_name: string;
  asset_type: string;
  version_count: number;
  latest_version: number;
}

export interface SaveVersionInfo {
  /** The group name (either new or existing) */
  groupName: string;
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
  /** List of existing registry entry names for the "Add to existing" option */
  existingNames: string[];
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

  // Find selected group info for "next version" display
  const selectedGroup =
    mode === 'existing' && existingTarget
      ? groups.find((g) => g.group_name === existingTarget)
      : null;
  const nextVersion = selectedGroup ? selectedGroup.latest_version + 1 : 1;

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
    const groupName = mode === 'new' ? newName.trim() : existingTarget!;
    onSave({
      groupName,
      mode,
      tag,
      description:
        description.trim() || `Created from job ${jobId ?? 'unknown'}`,
    });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 520, maxWidth: '95vw' }}>
        <ModalClose />
        <Stack direction="row" alignItems="center" gap={1}>
          <LayersIcon size={20} />
          <Typography level="h4">Publish {typeLabel} to Registry</Typography>
        </Stack>
        <Typography level="body-sm" sx={{ mb: 2 }}>
          Publish <strong>{sourceName}</strong> as a new versioned entry in the{' '}
          {typeLabel.toLowerCase()} registry.
        </Typography>

        {/* ── Group selection ── */}
        <RadioGroup
          value={mode}
          onChange={(e) => setMode(e.target.value as 'new' | 'existing')}
          sx={{ gap: 2 }}
        >
          {/* Option 1: Create new group */}
          <Box>
            <Radio value="new" label="Create new group" />
            {mode === 'new' && (
              <FormControl sx={{ ml: 4, mt: 1 }}>
                <FormLabel>Group name</FormLabel>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`e.g. my-${typeLabel.toLowerCase()}`}
                  autoFocus
                />
                <Typography level="body-xs" color="neutral" sx={{ mt: 0.5 }}>
                  This will be version <strong>1</strong> in the new group.
                </Typography>
              </FormControl>
            )}
          </Box>

          {/* Option 2: Add version to existing group */}
          <Box>
            <Radio
              value="existing"
              label={`Add version to existing group`}
              disabled={groupNames.length === 0}
            />
            {mode === 'existing' && (
              <FormControl sx={{ ml: 4, mt: 1 }}>
                <FormLabel>Select group</FormLabel>
                <Autocomplete
                  options={groupNames}
                  value={existingTarget}
                  onChange={(_e, value) => setExistingTarget(value)}
                  placeholder={`Search groups…`}
                  autoFocus
                />
                {selectedGroup && (
                  <Typography level="body-xs" color="neutral" sx={{ mt: 0.5 }}>
                    Currently has {selectedGroup.version_count} version
                    {selectedGroup.version_count !== 1 ? 's' : ''}. This will be
                    version <strong>{nextVersion}</strong>.
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
              The tag will be moved from any version that currently holds it.
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

        {/* ── Actions ── */}
        <Stack
          direction="row"
          justifyContent="flex-end"
          spacing={1}
          sx={{ mt: 3 }}
        >
          <Button
            variant="plain"
            color="neutral"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            startDecorator={<Save size={16} />}
            onClick={handleSubmit}
            loading={saving}
            disabled={!canSave}
          >
            {mode === 'new' ? 'Publish as v1' : `Publish as v${nextVersion}`}
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
