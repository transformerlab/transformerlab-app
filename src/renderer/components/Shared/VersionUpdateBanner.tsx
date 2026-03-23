import { Box, IconButton, Link, Typography } from '@mui/joy';
import { useState } from 'react';
import { XIcon } from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetcher } from 'renderer/lib/api-client/hooks';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface VersionInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
}

const UPDATE_DOCS_URL = 'https://lab.cloud/for-teams/update';

const updateCheckDisabled = process.env.TL_DISABLE_UPDATE_CHECK === 'true';

function stripV(version: string): string {
  return version.startsWith('v') ? version.slice(1) : version;
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = stripV(latest).split('.').map(Number);
  const currentParts = stripV(current).split('.').map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export default function VersionUpdateBanner() {
  const [dismissed, setDismissed] = useState<string | null>(null);

  const { data } = useSWR<VersionInfo>(
    updateCheckDisabled ? null : chatAPI.Endpoints.ServerInfo.Version(),
    fetcher,
    {
      refreshInterval: 1_800_000, // 30 minutes
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );

  if (updateCheckDisabled) return null;
  if (!data?.update_available || !data.latest_version) return null;
  if (!isNewerVersion(data.latest_version, data.current_version)) return null;
  if (dismissed === data.latest_version) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        mx: -4,
        mt: -2,
        mb: 2,
        backgroundColor: 'var(--joy-palette-warning-softBg)',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level="body-sm">
          A new version of Transformer Lab is available (v
          {stripV(data.latest_version)}). You are running v
          {stripV(data.current_version)}.{' '}
          <Link
            href={UPDATE_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            level="body-sm"
          >
            Learn how to update
          </Link>
        </Typography>
      </Box>
      <IconButton
        size="sm"
        variant="plain"
        color="neutral"
        onClick={() => setDismissed(data.latest_version)}
        sx={{ mt: 0.25 }}
      >
        <XIcon size={16} />
      </IconButton>
    </Box>
  );
}
