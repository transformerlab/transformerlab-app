import { useMemo, useState } from 'react';
import { Box, Button, Card, Option, Select, Sheet, Typography } from '@mui/joy';

import { useAPI, useAuth } from 'renderer/lib/authContext';
import { getAPIFullPath } from 'renderer/lib/api-client/urls';

type Team = { id: string; name: string; role?: string };

function parseHashQuery(): URLSearchParams {
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIndex + 1));
}

function isLoopbackRedirect(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:') return false;
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  } catch {
    return false;
  }
}

function defaultTeamId(teams: Team[]): string | null {
  if (!teams.length) return null;
  const owner = teams.find((t) => (t.role || '').toLowerCase() === 'owner');
  return (owner ?? teams[0]).id;
}

function keyName(hostname: string | null): string {
  const host = (hostname || 'unknown').slice(0, 64);
  const date = new Date().toISOString().slice(0, 10);
  return `lab CLI (${host} ${date})`;
}

export default function CliAuthPage() {
  const params = useMemo(() => parseHashQuery(), []);
  const state = params.get('state');
  const redirect = params.get('redirect');
  const hostname = params.get('hostname');
  const redirectOk = isLoopbackRedirect(redirect);

  const { fetchWithAuth } = useAuth();
  const { data: teamsResp } = useAPI('teams', ['list']);
  const teams: Team[] = teamsResp?.teams || [];

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveTeamId = selectedTeamId ?? defaultTeamId(teams);

  if (!redirectOk || !state) {
    return (
      <Sheet sx={{ maxWidth: 520, mx: 'auto', mt: 12, p: 3 }}>
        <Card color="danger" variant="soft">
          <Typography level="h4">Invalid CLI redirect</Typography>
          <Typography>
            This CLI login link is malformed or points to a non-loopback URL. It
            may be a phishing attempt. Do not authorize.
          </Typography>
        </Card>
      </Sheet>
    );
  }

  const handleAuthorize = async () => {
    if (!effectiveTeamId) {
      setError('No team selected.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const url = getAPIFullPath('auth', ['apiKeys', 'create'], {}) || '';
      const resp = await fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName(hostname),
          team_id: effectiveTeamId,
          expires_in_days: null,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        setError(
          `Failed to create API key: ${detail.detail || resp.statusText}`,
        );
        setSubmitting(false);
        return;
      }
      const data = await resp.json();
      const teamName =
        data.team_name ||
        teams.find((t) => t.id === effectiveTeamId)?.name ||
        '';
      const fragment = new URLSearchParams({
        key: data.api_key,
        state: state!,
        team_id: effectiveTeamId,
        team_name: teamName,
      }).toString();
      window.location.assign(`${redirect}#${fragment}`);
    } catch (e) {
      setError('Network error contacting the API.');
      setSubmitting(false);
    }
  };

  return (
    <Sheet sx={{ maxWidth: 520, mx: 'auto', mt: 12, p: 3 }}>
      <Card>
        <Typography level="h3">Authorize Lab CLI</Typography>
        <Typography>
          A CLI on this machine is requesting an API key for your account. The
          key will be scoped to the team you choose below and shown in your API
          keys page where you can revoke it later.
        </Typography>

        <Box sx={{ mt: 2 }}>
          <Typography level="body-sm" sx={{ mb: 0.5 }}>
            Team
          </Typography>
          <Select
            value={effectiveTeamId ?? ''}
            onChange={(_, v) => setSelectedTeamId((v as string) || null)}
            placeholder="Select a team"
          >
            {teams.map((t) => (
              <Option key={t.id} value={t.id}>
                {t.name}
              </Option>
            ))}
          </Select>
        </Box>

        {error && (
          <Typography color="danger" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}

        <Box
          sx={{ mt: 3, display: 'flex', gap: 1, justifyContent: 'flex-end' }}
        >
          <Button
            variant="plain"
            onClick={() => {
              window.location.hash = '#/';
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAuthorize}
            loading={submitting}
            disabled={!effectiveTeamId}
          >
            Authorize
          </Button>
        </Box>
      </Card>
    </Sheet>
  );
}
