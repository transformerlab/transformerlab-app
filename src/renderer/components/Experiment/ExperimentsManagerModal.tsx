import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Dropdown,
  IconButton,
  Input,
  Menu,
  MenuButton,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Table,
  Tooltip,
  Typography,
} from '@mui/joy';
import { PencilIcon, ShareIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useSWRWithAuth as useSWR,
  useAuth,
  useAPI,
} from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import ShareExperimentModal from './ShareExperimentModal';
import { parseTagInput } from './tagUtils';

interface Experiment {
  id: string;
  name: string;
  last_opened_at: string | null;
  config?: { created_by?: string; tags?: string[] };
}

interface TeamMember {
  user_id: string;
  email?: string;
  role: string;
}

interface ExperimentsManagerModalProps {
  open: boolean;
  onClose: () => void;
  onExperimentSelect: (experimentId: string) => void;
  onNewExperiment: () => void;
  mutateRecent: () => void | Promise<unknown>;
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  // Server clock slightly ahead of client yields negative diffDays ("-1 days ago").
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

interface TagEditorProps {
  experimentId: string;
  experimentName: string;
  tags: string[];
  onChanged: () => void | Promise<unknown>;
}

function TagEditor({
  experimentId,
  experimentName,
  tags,
  onChanged,
}: TagEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const id = experimentId || experimentName;

  async function callTagApi(url: string, tagList: string[]) {
    setBusy(true);
    setError(null);
    try {
      await fetcher(url, {
        method: 'POST',
        body: JSON.stringify({ tags: tagList }),
      });
      await onChanged();
    } catch (e: any) {
      const detail =
        e?.response && typeof e.response === 'object' && 'detail' in e.response
          ? String(e.response.detail)
          : e instanceof Error
            ? e.message
            : String(e);
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const parsed = parseTagInput(draft);
    if (parsed.length === 0) return;
    await callTagApi(chatAPI.Endpoints.Experiment.TagsAdd(id), parsed);
    setDraft('');
  }

  async function handleRemove(tag: string) {
    await callTagApi(chatAPI.Endpoints.Experiment.TagsRemove(id), [tag]);
  }

  return (
    <Dropdown>
      <Tooltip title="Edit tags">
        <MenuButton
          slots={{ root: IconButton }}
          slotProps={{ root: { size: 'sm', variant: 'plain' } }}
        >
          <PencilIcon size={14} />
        </MenuButton>
      </Tooltip>
      <Menu sx={{ p: 1.5, minWidth: 260 }}>
        <Stack spacing={1}>
          <Typography level="body-xs">Tags</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {tags.length === 0 && (
              <Typography level="body-xs" color="neutral">
                No tags yet.
              </Typography>
            )}
            {tags.map((t) => (
              <Chip
                key={t}
                size="sm"
                variant="soft"
                color="neutral"
                endDecorator={
                  <IconButton
                    size="sm"
                    variant="plain"
                    onClick={() => handleRemove(t)}
                    disabled={busy}
                  >
                    <XIcon size={10} />
                  </IconButton>
                }
              >
                {t}
              </Chip>
            ))}
          </Box>
          <Input
            size="sm"
            placeholder="Add tags (comma or Enter)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            disabled={busy}
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={busy || draft.trim().length === 0}
          >
            Add
          </Button>
          {error && (
            <Typography level="body-xs" color="danger">
              {error}
            </Typography>
          )}
        </Stack>
      </Menu>
    </Dropdown>
  );
}

export default function ExperimentsManagerModal({
  open,
  onClose,
  onExperimentSelect,
  onNewExperiment,
  mutateRecent,
}: ExperimentsManagerModalProps) {
  const { user, team } = useAuth();
  const [search, setSearch] = useState('');
  const [shareTarget, setShareTarget] = useState<Experiment | null>(null);

  const {
    data: experiments,
    isLoading,
    mutate,
  } = useSWR(
    open && chatAPI.API_URL() !== null
      ? chatAPI.Endpoints.Experiment.GetAll()
      : null,
    fetcher,
  );

  // Fetch team members for ShareExperimentModal (matches Team.tsx pattern)
  const { data: membersData } = useAPI('teams', ['getMembers'], {
    teamId: team?.id ?? null,
  });
  const members: TeamMember[] = Array.isArray(membersData?.members)
    ? membersData.members
    : [];

  // Determine if current user is team owner (admin)
  const isAdmin = useMemo(
    () => members.some((m) => m.user_id === user?.id && m.role === 'owner'),
    [members, user?.id],
  );

  const currentUserId = user?.id as string | undefined;

  const filtered = useMemo(() => {
    if (!Array.isArray(experiments)) return [];
    const q = search.toLowerCase();
    return experiments.filter((e: Experiment) =>
      e.name?.toLowerCase().includes(q),
    );
  }, [experiments, search]);

  const canManage = (exp: Experiment) =>
    isAdmin || exp.config?.created_by === currentUserId;

  const handleDelete = async (exp: Experiment) => {
    if (
      !confirm(
        `Are you sure you want to delete "${exp.name}"? This cannot be undone.`,
      )
    )
      return;
    await chatAPI.authenticatedFetch(
      chatAPI.Endpoints.Experiment.Delete(exp.id),
      {},
    );
    mutate();
    mutateRecent();
  };

  const handleOpen = (exp: Experiment) => {
    onExperimentSelect(exp.id);
    mutate();
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalDialog
          sx={{
            width: '90vw',
            maxWidth: 900,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            // Room for ModalClose (absolute top-right); extra top padding for header block.
            pt: 2.5,
            pr: 5.5,
            pb: 2,
            px: 2.5,
          }}
        >
          <ModalClose />
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 32,
                pr: 0.5,
              }}
            >
              <Typography level="h3" component="h2">
                Experiments
              </Typography>
            </Box>
            <Box>
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  onNewExperiment();
                }}
              >
                + New Experiment
              </Button>
            </Box>
          </Stack>
          <Input
            placeholder="Search experiments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Divider />

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : filtered.length === 0 ? (
            <Typography
              level="body-sm"
              color="neutral"
              sx={{ py: 4, textAlign: 'center' }}
            >
              {search
                ? 'No experiments match your search.'
                : 'No experiments yet.'}
            </Typography>
          ) : (
            <Box sx={{ overflowY: 'auto', flex: 1 }}>
              <Table stickyHeader hoverRow>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th style={{ width: 160 }}>Owner</th>
                    <th style={{ width: 120 }}>Last Opened</th>
                    <th style={{ width: 100 }}>Sharing</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((exp: Experiment) => {
                    const ownerLabel =
                      exp.config?.created_by === currentUserId
                        ? 'you'
                        : (members.find(
                            (m) => m.user_id === exp.config?.created_by,
                          )?.email ?? 'unknown');

                    return (
                      <tr key={exp.id}>
                        <td>
                          <Stack spacing={0.5}>
                            <Typography
                              level="body-sm"
                              fontWeight="md"
                              sx={{
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                              onClick={() => handleOpen(exp)}
                            >
                              {exp.name}
                            </Typography>
                            {Array.isArray(exp.config?.tags) &&
                              exp.config.tags.length > 0 && (
                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 0.5,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  {exp.config.tags.map((t) => (
                                    <Chip
                                      key={t}
                                      size="sm"
                                      variant="soft"
                                      color="neutral"
                                    >
                                      {t}
                                    </Chip>
                                  ))}
                                </Box>
                              )}
                          </Stack>
                        </td>
                        <td>
                          <Typography level="body-xs" color="neutral">
                            {ownerLabel}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-xs" color="neutral">
                            {formatRelativeTime(exp.last_opened_at)}
                          </Typography>
                        </td>
                        <td>
                          {isAdmin ? (
                            <Chip size="sm" variant="soft" color="neutral">
                              {canManage(exp) ? 'owned' : 'team'}
                            </Chip>
                          ) : exp.config?.created_by === currentUserId ? (
                            <Chip size="sm" variant="soft" color="primary">
                              yours
                            </Chip>
                          ) : (
                            <Chip size="sm" variant="soft" color="neutral">
                              shared
                            </Chip>
                          )}
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <TagEditor
                              experimentId={exp.id}
                              experimentName={exp.name}
                              tags={
                                Array.isArray(exp.config?.tags)
                                  ? exp.config!.tags!
                                  : []
                              }
                              onChanged={() => mutate()}
                            />
                            <Button
                              size="sm"
                              variant="plain"
                              onClick={() => handleOpen(exp)}
                            >
                              Open
                            </Button>
                            {canManage(exp) && (
                              <>
                                <Tooltip title="Share">
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    onClick={() => setShareTarget(exp)}
                                  >
                                    <ShareIcon size={14} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="danger"
                                    onClick={() => handleDelete(exp)}
                                  >
                                    <Trash2Icon size={14} />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Box>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Box>
          )}
        </ModalDialog>
      </Modal>

      {shareTarget && (
        <ShareExperimentModal
          open={Boolean(shareTarget)}
          experimentId={shareTarget.id}
          experimentName={shareTarget.name}
          members={members}
          onShared={() => {
            mutate();
            mutateRecent();
          }}
          onClose={() => setShareTarget(null)}
        />
      )}
    </>
  );
}
