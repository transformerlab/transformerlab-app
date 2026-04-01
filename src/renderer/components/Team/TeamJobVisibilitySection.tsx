import {
  Box,
  Button,
  Typography,
  Select,
  Option,
  Stack,
  CircularProgress,
  Alert,
  FormControl,
  FormLabel,
  Sheet,
} from '@mui/joy';
import { useEffect, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

type VisibilityMode = 'all' | 'own';

export default function TeamJobVisibilitySection({
  teamId,
  isOwner,
}: {
  teamId: string;
  isOwner: boolean;
}) {
  const { fetchWithAuth } = useAuth();
  const [mode, setMode] = useState<VisibilityMode>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!teamId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithAuth(
          chatAPI.Endpoints.Teams.GetJobVisibility(teamId),
        );
        if (res.ok) {
          const data = await res.json();
          const m = (data?.mode as string)?.toLowerCase();
          setMode(m === 'own' ? 'own' : 'all');
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.detail || 'Failed to load visibility setting');
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [teamId, fetchWithAuth]);

  const handleSave = async () => {
    if (!teamId || !isOwner) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetchWithAuth(
        chatAPI.Endpoints.Teams.SetJobVisibility(teamId),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || 'Failed to save');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ py: 2 }}>
        <CircularProgress size="sm" />
      </Box>
    );
  }

  return (
    <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'sm', mb: 3 }}>
      <Typography level="title-md" sx={{ mb: 1 }}>
        Jobs and tasks visibility
      </Typography>
      <Typography level="body-sm" sx={{ mb: 2, color: 'text.secondary' }}>
        Control whether team members see all jobs and task templates in an
        experiment, or only their own. Team owners always see everything.
      </Typography>
      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" flexWrap="wrap" gap={2} alignItems="flex-end">
        <FormControl sx={{ minWidth: 280 }}>
          <FormLabel>Member visibility</FormLabel>
          <Select
            value={mode}
            onChange={(_, v) => v && setMode(v as VisibilityMode)}
            disabled={!isOwner}
            placeholder="Select mode"
          >
            <Option value="all">All members see all jobs and tasks</Option>
            <Option value="own">
              Members see only their own jobs and tasks
            </Option>
          </Select>
        </FormControl>
        {isOwner && (
          <Button
            loading={saving}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            Save
          </Button>
        )}
      </Stack>
      {!isOwner && (
        <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
          Only team owners can change this setting.
        </Typography>
      )}
    </Sheet>
  );
}
