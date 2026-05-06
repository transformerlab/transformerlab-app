import {
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Modal,
  ModalClose,
  ModalDialog,
  Option,
  Select,
  Stack,
  Table,
  Typography,
} from '@mui/joy';
import { Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';

type PermissionLevel = 'read' | 'read_write' | 'admin';

const LEVEL_ACTIONS: Record<PermissionLevel, string[]> = {
  read: ['read'],
  read_write: ['read', 'write', 'execute'],
  admin: ['read', 'write', 'execute', 'delete', 'admin'],
};

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  read: 'Read',
  read_write: 'Read + Write',
  admin: 'Admin',
};

interface ShareRule {
  id: string;
  user_id: string;
  resource_type: string;
  resource_id: string;
  actions: string[];
}

interface TeamMember {
  user_id: string;
  email?: string;
  role: string;
}

interface ShareExperimentModalProps {
  open: boolean;
  experimentId: string;
  experimentName: string;
  members: TeamMember[];
  onClose: () => void;
  onShared?: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Request failed';
}

export default function ShareExperimentModal({
  open,
  experimentId,
  experimentName,
  members,
  onClose,
  onShared,
}: ShareExperimentModalProps) {
  const { team, fetchWithAuth } = useAuth();
  const [rules, setRules] = useState<ShareRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<PermissionLevel>('read');

  const nonOwnerMembers = members.filter((m) => m.role !== 'owner');

  useEffect(() => {
    if (!open || !team?.id) return;
    setLoading(true);
    // GET /teams/{teamId}/permissions returns all team rules — filter by this experiment
    fetchWithAuth(`teams/${team.id}/permissions`)
      .then((res) => res.json())
      .then((data: { permissions?: ShareRule[] } | ShareRule[]) => {
        const raw = Array.isArray(data) ? data : data?.permissions;
        const list = Array.isArray(raw) ? raw : [];
        const forThisExp = list.filter(
          (r) =>
            r.resource_type === 'experiment' &&
            String(r.resource_id) === String(experimentId),
        );
        setRules(forThisExp);
      })
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [open, team?.id, experimentId, fetchWithAuth]);

  const onAdd = async () => {
    if (!selectedUserId || !team?.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`teams/${team.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUserId,
          resource_type: 'experiment',
          resource_id: experimentId,
          actions: LEVEL_ACTIONS[selectedLevel],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      setRules((prev) => {
        const without = prev.filter((r) => r.user_id !== saved.user_id);
        return [...without, saved];
      });
      setSelectedUserId('');
      onShared?.();
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Failed to add share');
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async (ruleId: string) => {
    if (!team?.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `teams/${team.id}/permissions/${ruleId}`,
        {
          method: 'DELETE',
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      onShared?.();
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Failed to remove share');
    } finally {
      setSaving(false);
    }
  };

  const getMemberEmail = (userId: string) =>
    members.find((m) => m.user_id === userId)?.email ?? userId;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: 480 }}>
        <ModalClose />
        <Typography level="title-lg">
          Share &quot;{experimentName}&quot;
        </Typography>
        <Divider sx={{ my: 1 }} />

        {error && (
          <Typography color="danger" level="body-sm" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Select
            placeholder="Select team member"
            value={selectedUserId}
            onChange={(_, v) => setSelectedUserId(v ?? '')}
            sx={{ flex: 1 }}
          >
            {nonOwnerMembers.map((m) => (
              <Option key={m.user_id} value={m.user_id}>
                {m.email ?? m.user_id}
              </Option>
            ))}
          </Select>
          <Select
            value={selectedLevel}
            onChange={(_, v) =>
              setSelectedLevel((v as PermissionLevel) ?? 'read')
            }
            sx={{ width: 140 }}
          >
            {(Object.keys(LEVEL_LABELS) as PermissionLevel[]).map((level) => (
              <Option key={level} value={level}>
                {LEVEL_LABELS[level]}
              </Option>
            ))}
          </Select>
          <Button onClick={onAdd} loading={saving} disabled={!selectedUserId}>
            Add
          </Button>
        </Stack>

        {loading ? (
          <CircularProgress size="sm" />
        ) : rules.length === 0 ? (
          <Typography level="body-sm" color="neutral">
            Not shared with anyone yet.
          </Typography>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>User</th>
                <th>Access</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{getMemberEmail(rule.user_id)}</td>
                  <td>
                    {rule.actions.includes('admin')
                      ? 'Admin'
                      : rule.actions.includes('write')
                        ? 'Read + Write'
                        : 'Read'}
                  </td>
                  <td>
                    <IconButton
                      size="sm"
                      color="danger"
                      variant="plain"
                      onClick={() => onRemove(rule.id)}
                    >
                      <Trash2Icon size={14} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </ModalDialog>
    </Modal>
  );
}
