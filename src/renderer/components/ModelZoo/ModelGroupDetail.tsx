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
import { ChevronLeftIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useSWRWithAuth as useSWR,
  fetchWithAuth,
} from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';
import AssetGroupVersionsTable from '../Registry/AssetGroupVersionsTable';
import { GroupSummary } from '../Registry/AssetGroupCard';

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
    return list.find((v) => v.tag === 'latest') || list[0];
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

        <TabPanel value="card" sx={{ flex: 1, overflow: 'auto', px: 0, pt: 2 }}>
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
          <AssetGroupVersionsTable
            groupId={group.group_id}
            assetType="model"
            metadataColumns={[
              { label: 'Architecture', width: 140, field: 'architecture' },
              { label: 'Params', width: 80, field: 'parameters' },
            ]}
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
