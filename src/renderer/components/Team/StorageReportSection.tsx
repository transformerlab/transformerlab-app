import { useEffect, useState, useCallback } from 'react';
import {
  Typography,
  Card,
  CardContent,
  Table,
  LinearProgress,
  Button,
  Input,
  FormControl,
  FormLabel,
  Alert,
  Stack,
} from '@mui/joy';
import { useAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface StorageUsage {
  team_id: string;
  total_bytes: number;
  total_gb: number;
  breakdown: Record<string, number>;
  per_user: Record<string, number>;
  scanned_at: string | null;
  global_limit_bytes: number | null;
  org_threshold_bytes: number | null;
  user_threshold_bytes: number | null;
}

interface StorageAlertItem {
  scope: string;
  subject: string;
  used_bytes: number;
  limit_bytes: number;
}

const GB = 1024 ** 3;
const toGb = (b: number) => (b / GB).toFixed(2);

export default function StorageReportSection({ teamId }: { teamId: string }) {
  const { fetchWithAuth } = useAuth();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [alerts, setAlerts] = useState<StorageAlertItem[]>([]);
  const [orgThresholdGb, setOrgThresholdGb] = useState('');
  const [userThresholdGb, setUserThresholdGb] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, aRes] = await Promise.all([
        fetchWithAuth(chatAPI.Endpoints.Storage.GetUsage()),
        fetchWithAuth(chatAPI.Endpoints.Storage.GetAlerts()),
      ]);
      if (uRes.ok) {
        const u: StorageUsage = await uRes.json();
        setUsage(u);
        setOrgThresholdGb(
          u.org_threshold_bytes ? toGb(u.org_threshold_bytes) : '',
        );
        setUserThresholdGb(
          u.user_threshold_bytes ? toGb(u.user_threshold_bytes) : '',
        );
      } else {
        console.error(
          'Error loading storage usage: response not ok',
          uRes.status,
        );
      }
      if (aRes.ok) {
        const a: { alerts?: StorageAlertItem[] } = await aRes.json();
        setAlerts(a.alerts || []);
      } else {
        setAlerts([]);
      }
    } catch (e) {
      console.error('Error loading storage usage:', e);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, teamId]);

  useEffect(() => {
    load();
  }, [load, teamId]);

  const rescan = async () => {
    setLoading(true);
    try {
      await fetchWithAuth(chatAPI.Endpoints.Storage.Rescan(), {
        method: 'POST',
      });
      await load();
    } finally {
      setLoading(false);
    }
  };

  const saveThresholds = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(
        chatAPI.Endpoints.Storage.UpdateThresholds(),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_threshold_bytes: orgThresholdGb
              ? Math.round(parseFloat(orgThresholdGb) * GB)
              : null,
            user_threshold_bytes: userThresholdGb
              ? Math.round(parseFloat(userThresholdGb) * GB)
              : null,
          }),
        },
      );
      if (res.ok) {
        await load();
      } else {
        console.error('Error saving thresholds:', res.status, res.statusText);
      }
    } catch (e) {
      console.error('Error saving thresholds:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!usage) {
    return (
      <Typography>
        {loading ? 'Loading storage usage…' : 'No storage data yet.'}
      </Typography>
    );
  }

  const limitGb = usage.global_limit_bytes
    ? usage.global_limit_bytes / GB
    : null;
  const pct = limitGb ? Math.min((usage.total_gb / limitGb) * 100, 100) : 0;

  return (
    <Stack spacing={2}>
      {alerts.map((al, idx) => (
        <Alert key={`${al.scope}:${al.subject}:${idx}`} color="danger">
          {al.scope === 'global'
            ? `Org storage (${toGb(al.used_bytes)} GB) exceeds the global limit (${toGb(al.limit_bytes)} GB). New job launches are blocked until usage drops.`
            : `${al.scope === 'user' ? `User ${al.subject}` : 'Org'} storage (${toGb(al.used_bytes)} GB) is over the ${toGb(al.limit_bytes)} GB threshold.`}
        </Alert>
      ))}

      <Card>
        <CardContent>
          <Typography level="title-md">Total storage used</Typography>
          <Typography level="h3">{usage.total_gb} GB</Typography>
          {limitGb && (
            <>
              <LinearProgress determinate value={pct} sx={{ my: 1 }} />
              <Typography level="body-sm">
                {usage.total_gb} GB of {limitGb} GB global per-org limit
              </Typography>
            </>
          )}
          <Typography level="body-xs" sx={{ mt: 1 }}>
            Last scanned:{' '}
            {usage.scanned_at
              ? new Date(usage.scanned_at).toLocaleString()
              : 'never'}
          </Typography>
          <Button
            size="sm"
            variant="outlined"
            sx={{ mt: 1 }}
            loading={loading}
            onClick={rescan}
          >
            Recalculate now
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography level="title-md">Breakdown by category</Typography>
          <Table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Size (GB)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(usage.breakdown).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{toGb(v)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography level="title-md">Breakdown by user</Typography>
          <Table>
            <thead>
              <tr>
                <th>User</th>
                <th>Size (GB)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(usage.per_user).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{toGb(v)}</td>
                </tr>
              ))}
              {Object.keys(usage.per_user).length === 0 && (
                <tr>
                  <td colSpan={2}>No per-user data.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography level="title-md">Notification thresholds</Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <FormControl>
              <FormLabel>Org threshold (GB)</FormLabel>
              <Input
                type="number"
                value={orgThresholdGb}
                onChange={(e) => setOrgThresholdGb(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Per-user threshold (GB)</FormLabel>
              <Input
                type="number"
                value={userThresholdGb}
                onChange={(e) => setUserThresholdGb(e.target.value)}
              />
            </FormControl>
          </Stack>
          <Button
            size="sm"
            sx={{ mt: 2 }}
            loading={saving}
            onClick={saveThresholds}
          >
            Save thresholds
          </Button>
        </CardContent>
      </Card>
    </Stack>
  );
}
