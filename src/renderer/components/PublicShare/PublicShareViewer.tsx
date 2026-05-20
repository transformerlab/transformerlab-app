import { useEffect, useState } from 'react';
import { Box, CircularProgress, Link, Typography } from '@mui/joy';
import { API_URL } from 'renderer/lib/api-client/urls';
import PublicShareNotes from './PublicShareNotes';
import PublicShareChart from './PublicShareChart';

interface PublicSharePayload {
  resource_type: 'experiment_notes' | 'experiment_chart';
  experiment_name: string;
  payload: { markdown: string } | { jobs: unknown[] };
}

function getToken(): string {
  const hash = window.location.hash || '';
  const match = hash.match(/#\/public\/share\/([^/?#]+)/);
  return match ? match[1] : '';
}

export default function PublicShareViewer() {
  const token = getToken();
  const apiUrl = API_URL();
  const [data, setData] = useState<PublicSharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('Invalid link');
      setLoading(false);
      return;
    }
    // window.TransformerLab.API_URL is populated by App's useEffect, which
    // fires after children mount — wait until it's ready before fetching.
    if (!apiUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const base = apiUrl.replace(/\/$/, '');
    fetch(`${base}/public/share/${token}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setError('This link is no longer active.');
          return null;
        }
        if (!r.ok) {
          if (!cancelled) setError('Could not load this link.');
          return null;
        }
        return (await r.json()) as PublicSharePayload;
      })
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this link.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, apiUrl]);

  const marketingUrl = 'https://lab.cloud';

  const bodyContent = (
    <>
      {loading && <CircularProgress />}
      {!loading && error && (
        <Typography level="body-md" color="danger">
          {error}
        </Typography>
      )}
      {!loading && data?.resource_type === 'experiment_notes' && (
        <PublicShareNotes
          markdown={(data.payload as { markdown: string }).markdown}
          apiUrl={apiUrl}
        />
      )}
      {!loading && data?.resource_type === 'experiment_chart' && (
        <PublicShareChart jobs={(data.payload as { jobs: unknown[] }).jobs} />
      )}
    </>
  );

  return (
    <Box
      sx={{
        colorScheme: 'light',
        height: '100vh',
        overflow: 'auto',
        bgcolor: 'common.white',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        component="header"
        sx={{
          px: 4,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography level="title-lg">
          {data?.experiment_name ?? 'Transformer Lab'}
        </Typography>
      </Box>
      <Box
        component="main"
        sx={{
          flex: 1,
          width: '100%',
          maxWidth: data?.resource_type === 'experiment_chart' ? 1100 : 800,
          mx: 'auto',
          px: { xs: 2, md: 4 },
          py: 4,
        }}
      >
        {bodyContent}
      </Box>
      <Box
        component="footer"
        sx={{
          px: 4,
          py: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          textAlign: 'center',
        }}
      >
        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
          Powered by Transformer Lab —{' '}
          <Link href={marketingUrl} target="_blank" rel="noreferrer">
            Learn more →
          </Link>
        </Typography>
      </Box>
    </Box>
  );
}
