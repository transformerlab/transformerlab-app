import { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Input,
  Stack,
  Switch,
  Typography,
} from '@mui/joy';
import { CopyIcon } from 'lucide-react';
import { useAuth } from 'renderer/lib/authContext';

interface PublicShareLinkPopoverProps {
  experimentId: string | number;
  kind: 'notes' | 'chart';
  onChange?: () => void;
}

interface ShareLinkResponse {
  token: string;
  url: string;
  created_at: string | null;
}

const KIND_LABELS: Record<'notes' | 'chart', string> = {
  notes: "this experiment's notes",
  chart: "this experiment's progress chart",
};

export default function PublicShareLinkPopover({
  experimentId,
  kind,
  onChange,
}: PublicShareLinkPopoverProps) {
  const { fetchWithAuth } = useAuth();
  const [link, setLink] = useState<ShareLinkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWithAuth(`experiment/${experimentId}/share/${kind}`)
      .then((r) => r.json())
      .then((data: ShareLinkResponse | null) => {
        if (!cancelled) setLink(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load share status');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [experimentId, kind, fetchWithAuth]);

  const onToggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (next) {
        const r = await fetchWithAuth(
          `experiment/${experimentId}/share/${kind}`,
          { method: 'POST' },
        );
        if (!r.ok) throw new Error(await r.text());
        const data = (await r.json()) as ShareLinkResponse;
        setLink(data);
      } else {
        const r = await fetchWithAuth(
          `experiment/${experimentId}/share/${kind}`,
          { method: 'DELETE' },
        );
        if (!r.ok) throw new Error(await r.text());
        setLink(null);
      }
      onChange?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Box sx={{ minWidth: 360, p: 1 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography level="title-md">Public link</Typography>
        {loading ? (
          <CircularProgress size="sm" />
        ) : (
          <Switch
            checked={!!link}
            disabled={busy}
            onChange={(e) => onToggle(e.target.checked)}
          />
        )}
      </Stack>

      {error && (
        <Typography color="danger" level="body-sm" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      {link ? (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Input value={link.url} readOnly sx={{ flex: 1 }} />
            <IconButton variant="outlined" onClick={onCopy} title="Copy">
              <CopyIcon size={14} />
            </IconButton>
          </Stack>
          {copied && (
            <Typography level="body-xs" color="success">
              Copied to clipboard
            </Typography>
          )}
          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1 }}>
            Anyone with this link can view {KIND_LABELS[kind]}. Turning the
            toggle off and back on generates a new link.
          </Typography>
        </>
      ) : (
        !loading && (
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Off. Turn on to generate a link anyone can use to view{' '}
            {KIND_LABELS[kind]}.
          </Typography>
        )
      )}
    </Box>
  );
}
