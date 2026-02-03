import {
  Box,
  Button,
  Typography,
  Input,
  Stack,
  Table,
  CircularProgress,
  Alert,
  FormControl,
  FormLabel,
  Card,
} from '@mui/joy';
import { ClockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function QuotaSettingsSection({ teamId }: { teamId: string }) {
  const { fetchWithAuth } = useAuth();
  const [teamQuota, setTeamQuota] = useState<any>(null);
  const [userQuotas, setUserQuotas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTeamQuota, setNewTeamQuota] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newUserOverride, setNewUserOverride] = useState('');

  useEffect(() => {
    const fetchQuota = async () => {
      if (!teamId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [quotaRes, usersRes] = await Promise.all([
          fetchWithAuth(chatAPI.Endpoints.Quota.GetTeamQuota(teamId)),
          fetchWithAuth(chatAPI.Endpoints.Quota.GetTeamUsers(teamId)),
        ]);

        if (quotaRes.ok) {
          const quota = await quotaRes.json();
          setTeamQuota(quota);
          setNewTeamQuota(String(quota.monthly_quota_minutes || 0));
        }
        if (usersRes.ok) {
          const users = await usersRes.json();
          setUserQuotas(users || []);
        }
      } catch (error) {
        console.error('Error fetching quota:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuota();
  }, [teamId, fetchWithAuth]);

  const handleUpdateTeamQuota = async () => {
    const minutes = parseInt(newTeamQuota, 10);
    if (isNaN(minutes) || minutes < 0) {
      alert('Please enter a valid number of minutes (>= 0)');
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithAuth(
        chatAPI.Endpoints.Quota.UpdateTeamQuota(teamId),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthly_quota_minutes: minutes }),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setTeamQuota(updated);
        alert('Team quota updated successfully');
      } else {
        const error = await res.json();
        alert(`Failed to update quota: ${error.detail || res.statusText}`);
      }
    } catch (error) {
      console.error('Error updating quota:', error);
      alert('Failed to update quota');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUserOverride = async (userId: string) => {
    const minutes = parseInt(newUserOverride, 10);
    if (isNaN(minutes) || minutes < 0) {
      alert('Please enter a valid number of minutes (>= 0)');
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithAuth(
        chatAPI.Endpoints.Quota.UpdateUserOverride(userId, teamId),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthly_quota_minutes: minutes }),
        },
      );

      if (res.ok) {
        // Refresh user quotas
        const usersRes = await fetchWithAuth(
          chatAPI.Endpoints.Quota.GetTeamUsers(teamId),
        );
        if (usersRes.ok) {
          const users = await usersRes.json();
          setUserQuotas(users || []);
        }
        setEditingUser(null);
        setNewUserOverride('');
        alert('User quota override updated successfully');
      } else {
        const error = await res.json();
        alert(`Failed to update override: ${error.detail || res.statusText}`);
      }
    } catch (error) {
      console.error('Error updating override:', error);
      alert('Failed to update override');
    } finally {
      setSaving(false);
    }
  };

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes.toFixed(2)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography level="title-lg" mb={1} startDecorator={<ClockIcon />}>
          Quota Settings
        </Typography>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography level="title-lg" mb={2} startDecorator={<ClockIcon />}>
        Quota Settings
      </Typography>

      <Card variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography level="title-md" mb={1}>
              Team Monthly Quota
            </Typography>
            <Typography level="body-sm" color="neutral" mb={2}>
              Current Period:{' '}
              {teamQuota?.current_period_start
                ? formatDate(teamQuota.current_period_start)
                : 'N/A'}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="flex-end">
              <FormControl sx={{ flex: 1, maxWidth: 300 }}>
                <FormLabel>Monthly Quota (minutes)</FormLabel>
                <Input
                  type="number"
                  value={newTeamQuota}
                  onChange={(e) => setNewTeamQuota(e.target.value)}
                  placeholder="e.g. 1440 (24 hours)"
                  disabled={saving}
                />
              </FormControl>
              <Button
                onClick={handleUpdateTeamQuota}
                disabled={
                  saving ||
                  newTeamQuota === String(teamQuota?.monthly_quota_minutes || 0)
                }
                loading={saving}
              >
                Update Team Quota
              </Button>
            </Stack>
            <Typography level="body-xs" color="neutral" mt={1}>
              Current quota:{' '}
              {formatMinutes(teamQuota?.monthly_quota_minutes || 0)}
            </Typography>
          </Box>
        </Stack>
      </Card>

      <Box>
        <Typography level="title-md" mb={2}>
          User Quota Overrides
        </Typography>
        <Typography level="body-sm" color="neutral" mb={2}>
          Set additional quota for specific users beyond the team quota.
        </Typography>
        {userQuotas.length === 0 ? (
          <Alert color="neutral" variant="soft">
            No team members found.
          </Alert>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>User</th>
                <th>Team Quota</th>
                <th>Override</th>
                <th>Total</th>
                <th>Used</th>
                <th>Held</th>
                <th>Available</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {userQuotas.map((user: any) => (
                <tr key={user.user_id}>
                  <td>
                    <Typography level="body-sm">
                      {user.first_name} {user.last_name}
                    </Typography>
                    <Typography level="body-xs" color="neutral">
                      {user.email}
                    </Typography>
                  </td>
                  <td>{formatMinutes(user.team_quota || 0)}</td>
                  <td>
                    {editingUser === user.user_id ? (
                      <Input
                        type="number"
                        value={newUserOverride}
                        onChange={(e) => setNewUserOverride(e.target.value)}
                        placeholder="0"
                        size="sm"
                        sx={{ width: 100 }}
                        disabled={saving}
                      />
                    ) : (
                      <Typography level="body-sm">
                        {formatMinutes(user.user_override || 0)}
                      </Typography>
                    )}
                  </td>
                  <td>{formatMinutes(user.total_quota || 0)}</td>
                  <td>
                    <Typography
                      level="body-sm"
                      color={user.used_quota > 0 ? 'warning' : 'neutral'}
                    >
                      {formatMinutes(user.used_quota || 0)}
                    </Typography>
                  </td>
                  <td>
                    <Typography level="body-sm" color="neutral">
                      {formatMinutes(user.held_quota || 0)}
                    </Typography>
                  </td>
                  <td>
                    {user.overused_quota > 0 ? (
                      <Typography level="body-sm" color="danger">
                        -{formatMinutes(user.overused_quota)} (overused)
                      </Typography>
                    ) : (
                      <Typography level="body-sm" color="success">
                        {formatMinutes(user.available_quota || 0)}
                      </Typography>
                    )}
                  </td>
                  <td>
                    {editingUser === user.user_id ? (
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateUserOverride(user.user_id)}
                          disabled={saving}
                          loading={saving}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="plain"
                          onClick={() => {
                            setEditingUser(null);
                            setNewUserOverride('');
                          }}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    ) : (
                      <Button
                        size="sm"
                        variant="outlined"
                        onClick={() => {
                          setEditingUser(user.user_id);
                          setNewUserOverride(String(user.user_override || 0));
                        }}
                      >
                        Edit Override
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Box>
    </Box>
  );
}
