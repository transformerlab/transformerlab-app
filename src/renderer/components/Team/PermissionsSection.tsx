import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  CircularProgress,
  FormControl,
  FormLabel,
  Input,
  Option,
  Select,
  Stack,
  Table,
  Typography,
} from '@mui/joy';
import { PlusIcon, Trash2Icon, User2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';

type PermissionAction = 'read' | 'write' | 'execute' | 'delete' | 'admin';
type PermissionResourceType = 'experiment' | 'model' | 'dataset' | '*';

interface TeamMember {
  user_id: string;
  email?: string;
  role: string;
}

interface PermissionRule {
  id: string;
  user_id: string;
  team_id: string;
  resource_type: PermissionResourceType;
  resource_id: string;
  actions: PermissionAction[];
}

interface ResourceOption {
  id: string;
  label: string;
}

interface PermissionsSectionProps {
  teamId: string;
  members: TeamMember[];
}

const ALL_ACTIONS: PermissionAction[] = [
  'read',
  'write',
  'execute',
  'delete',
  'admin',
];

export default function PermissionsSection({
  teamId,
  members,
}: PermissionsSectionProps) {
  const { fetchWithAuth } = useAuth();

  const selectableMembers = useMemo(
    () => (members || []).filter((m) => m.role !== 'owner'),
    [members],
  );

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [loadingRules, setLoadingRules] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [addFormOpen, setAddFormOpen] = useState<boolean>(false);
  const [newResourceType, setNewResourceType] =
    useState<PermissionResourceType>('experiment');
  const [newResourceId, setNewResourceId] = useState<string>('*');
  const [newActions, setNewActions] = useState<PermissionAction[]>(['read']);
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([]);
  const [loadingResourceOptions, setLoadingResourceOptions] =
    useState<boolean>(false);

  useEffect(() => {
    if (!selectedUserId && selectableMembers.length > 0) {
      setSelectedUserId(selectableMembers[0].user_id);
    }
  }, [selectedUserId, selectableMembers]);

  useEffect(() => {
    const loadUserRules = async () => {
      if (!teamId || !selectedUserId) {
        setRules([]);
        return;
      }

      setLoadingRules(true);
      setError(null);
      try {
        const res = await fetchWithAuth(
          `teams/${teamId}/permissions/user/${selectedUserId}`,
        );
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || 'Failed to load permissions');
        }
        const data = await res.json();
        setRules((data.permissions || []) as PermissionRule[]);
      } catch (e: any) {
        setRules([]);
        setError(e?.message || 'Failed to load permissions');
      } finally {
        setLoadingRules(false);
      }
    };

    loadUserRules();
  }, [fetchWithAuth, teamId, selectedUserId]);

  useEffect(() => {
    const loadOptions = async () => {
      if (!teamId || !addFormOpen || newResourceType === '*') {
        setResourceOptions([]);
        return;
      }

      setLoadingResourceOptions(true);
      try {
        let endpoint = '';
        if (newResourceType === 'experiment') endpoint = 'experiment/';
        if (newResourceType === 'model') endpoint = 'model/list';
        if (newResourceType === 'dataset') endpoint = 'data/list';

        const res = await fetchWithAuth(endpoint);
        if (!res.ok) throw new Error('Failed to load resources');
        const data = await res.json();

        if (newResourceType === 'experiment') {
          const items = (data || []).map((exp: any) => ({
            id: String(exp.id),
            label: exp.name ? `${exp.name} (${exp.id})` : String(exp.id),
          }));
          setResourceOptions(items);
          return;
        }

        if (newResourceType === 'model') {
          const items = (data || []).map((model: any) => ({
            id: String(model.model_id),
            label: String(model.name || model.model_id),
          }));
          setResourceOptions(items);
          return;
        }

        if (newResourceType === 'dataset') {
          const items = (data || []).map((dataset: any) => ({
            id: String(dataset.dataset_id),
            label: String(dataset.name || dataset.dataset_id),
          }));
          setResourceOptions(items);
        }
      } catch {
        setResourceOptions([]);
      } finally {
        setLoadingResourceOptions(false);
      }
    };

    loadOptions();
  }, [addFormOpen, fetchWithAuth, newResourceType, teamId]);

  const groupedRules = useMemo(
    () =>
      rules.reduce<Record<string, PermissionRule[]>>((groups, rule) => {
        const key = rule.resource_type;
        return {
          ...groups,
          [key]: [...(groups[key] || []), rule],
        };
      }, {}),
    [rules],
  );

  const onToggleAction = (action: PermissionAction) => {
    setNewActions((prev) =>
      prev.includes(action)
        ? prev.filter((a) => a !== action)
        : [...prev, action],
    );
  };

  const onSaveRule = async () => {
    if (!teamId || !selectedUserId) return;

    setSaving(true);
    setError(null);
    try {
      const payload = {
        user_id: selectedUserId,
        resource_type: newResourceType,
        resource_id: newResourceId || '*',
        actions: newActions,
      };
      const res = await fetchWithAuth(`teams/${teamId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to save rule');
      }

      const saved = (await res.json()) as PermissionRule;
      setRules((prev) => {
        const withoutSameScope = prev.filter(
          (r) =>
            !(
              r.user_id === saved.user_id &&
              r.resource_type === saved.resource_type &&
              r.resource_id === saved.resource_id
            ),
        );
        return [...withoutSameScope, saved];
      });
      setAddFormOpen(false);
      setNewResourceType('experiment');
      setNewResourceId('*');
      setNewActions(['read']);
    } catch (e: any) {
      setError(e?.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteRule = async (ruleId: string) => {
    if (!teamId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`teams/${teamId}/permissions/${ruleId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to delete rule');
      }
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (e: any) {
      setError(e?.message || 'Failed to delete rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography level="title-lg" mb={1}>
        Resource Permissions
      </Typography>
      <Typography level="body-sm" color="neutral" mb={2}>
        Owners always have full access. Rules below apply to members only and
        restrict what they can do.
      </Typography>

      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Card variant="outlined" sx={{ minWidth: 280, flex: '0 0 320px' }}>
          <Typography level="title-md" mb={1}>
            Members
          </Typography>
          <Stack spacing={1}>
            {selectableMembers.length === 0 && (
              <Typography level="body-sm" color="neutral">
                No non-owner members to manage.
              </Typography>
            )}
            {selectableMembers.map((m) => (
              <Button
                key={m.user_id}
                variant={selectedUserId === m.user_id ? 'solid' : 'soft'}
                color={selectedUserId === m.user_id ? 'primary' : 'neutral'}
                onClick={() => setSelectedUserId(m.user_id)}
                startDecorator={<User2Icon size={14} />}
                sx={{ justifyContent: 'flex-start' }}
              >
                {m.email || m.user_id}
              </Button>
            ))}
          </Stack>
        </Card>

        <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={1}
          >
            <Typography level="title-md">
              Rules for{' '}
              {selectableMembers.find((m) => m.user_id === selectedUserId)
                ?.email || 'selected member'}
            </Typography>
            <Button
              startDecorator={<PlusIcon size={14} />}
              onClick={() => setAddFormOpen((v) => !v)}
              disabled={!selectedUserId || saving}
              size="sm"
            >
              {addFormOpen ? 'Cancel' : 'Add Rule'}
            </Button>
          </Stack>

          {addFormOpen && (
            <Card variant="soft" sx={{ mb: 2 }}>
              <Stack
                direction="row"
                spacing={2}
                alignItems="flex-end"
                flexWrap="wrap"
              >
                <FormControl sx={{ minWidth: 160 }}>
                  <FormLabel>Resource Type</FormLabel>
                  <Select
                    value={newResourceType}
                    onChange={(_, v) =>
                      setNewResourceType(
                        (v as PermissionResourceType) || 'experiment',
                      )
                    }
                  >
                    <Option value="experiment">Experiment</Option>
                    <Option value="model">Model</Option>
                    <Option value="dataset">Dataset</Option>
                    <Option value="*">All types</Option>
                  </Select>
                </FormControl>

                <FormControl sx={{ minWidth: 220, flex: 1 }}>
                  <FormLabel>Resource</FormLabel>
                  {newResourceType === '*' ? (
                    <Input value="All (*)" disabled />
                  ) : (
                    <Select
                      value={newResourceId}
                      onChange={(_, v) =>
                        setNewResourceId((v as string) || '*')
                      }
                    >
                      <Option value="*">All</Option>
                      {resourceOptions.map((opt) => (
                        <Option key={opt.id} value={opt.id}>
                          {opt.label}
                        </Option>
                      ))}
                    </Select>
                  )}
                </FormControl>

                <FormControl sx={{ minWidth: 280 }}>
                  <FormLabel>Allowed Actions</FormLabel>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {ALL_ACTIONS.map((action) => (
                      <Checkbox
                        key={action}
                        label={action}
                        checked={newActions.includes(action)}
                        onChange={() => onToggleAction(action)}
                      />
                    ))}
                  </Stack>
                </FormControl>

                <Button onClick={onSaveRule} loading={saving} disabled={saving}>
                  Save
                </Button>
              </Stack>
              {newActions.length === 0 && (
                <Alert color="warning" variant="soft" sx={{ mt: 1 }}>
                  No actions selected: this creates a deny-all rule for the
                  selected scope.
                </Alert>
              )}
              {loadingResourceOptions && (
                <Typography level="body-xs" color="neutral" mt={1}>
                  Loading resources…
                </Typography>
              )}
            </Card>
          )}

          {loadingRules && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress />
            </Box>
          )}
          {!loadingRules && rules.length === 0 && (
            <Alert color="neutral" variant="soft">
              No explicit rules. This member currently inherits default full
              access.
            </Alert>
          )}
          {!loadingRules && rules.length > 0 && (
            <Stack spacing={2}>
              {Object.entries(groupedRules).map(([resourceType, group]) => (
                <Box key={resourceType}>
                  <Typography level="title-sm" mb={1}>
                    {resourceType === '*' ? 'All resource types' : resourceType}
                  </Typography>
                  <Table
                    size="sm"
                    variant="soft"
                    sx={{
                      tableLayout: 'fixed',
                      width: '100%',
                      '& th:nth-of-type(1), & td:nth-of-type(1)': {
                        width: '35%',
                      },
                      '& th:nth-of-type(2), & td:nth-of-type(2)': {
                        width: '45%',
                      },
                      '& td:nth-of-type(2)': {
                        whiteSpace: 'normal',
                        overflowWrap: 'anywhere',
                      },
                      '& th:nth-of-type(3), & td:nth-of-type(3)': {
                        width: '120px',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      },
                    }}
                  >
                    <thead>
                      <tr>
                        <th>Resource</th>
                        <th>Actions</th>
                        <th style={{ width: 1, whiteSpace: 'nowrap' }}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((rule) => (
                        <tr key={rule.id}>
                          <td>
                            {rule.resource_id === '*'
                              ? 'All'
                              : rule.resource_id}
                          </td>
                          <td>{rule.actions.join(', ')}</td>
                          <td>
                            <Button
                              size="sm"
                              color="danger"
                              variant="outlined"
                              onClick={() => onDeleteRule(rule.id)}
                              disabled={saving}
                              sx={{
                                minWidth: 90,
                                whiteSpace: 'nowrap',
                                ml: 'auto',
                              }}
                              startDecorator={<Trash2Icon size={14} />}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Box>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    </Box>
  );
}
