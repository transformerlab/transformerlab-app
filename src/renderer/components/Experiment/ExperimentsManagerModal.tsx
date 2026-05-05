import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Table,
  Tooltip,
  Typography,
} from '@mui/joy';
import { PencilIcon, Share2Icon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useSWRWithAuth as useSWR,
  useAuth,
  useAPI,
} from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import RenameExperimentModal from './RenameExperimentModal';
import ShareExperimentModal from './ShareExperimentModal';

interface Experiment {
  id: string;
  name: string;
  last_opened_at: string | null;
  config?: { created_by?: string };
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

export default function ExperimentsManagerModal({
  open,
  onClose,
  onExperimentSelect,
  onNewExperiment,
  mutateRecent,
}: ExperimentsManagerModalProps) {
  const { user, team } = useAuth();
  const [search, setSearch] = useState('');
  const [renameTarget, setRenameTarget] = useState<Experiment | null>(null);
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
                                    <Share2Icon size={14} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Rename">
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    onClick={() => setRenameTarget(exp)}
                                  >
                                    <PencilIcon size={14} />
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

      {renameTarget && (
        <RenameExperimentModal
          open={Boolean(renameTarget)}
          experimentId={renameTarget.id}
          currentName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onRenamed={() => {
            mutate();
            mutateRecent();
            setRenameTarget(null);
          }}
        />
      )}

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
