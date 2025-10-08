import { useEffect, useState } from 'react';
import { Alert, CircularProgress, Sheet, Typography } from '@mui/joy';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_API_FALLBACK,
  parseCallbackParams,
  processAuthCallback,
} from './authCallbackUtils';

function isAuthCallbackLocation(loc: Location) {
  if (/\/auth\/callback\/?$/.test(loc.pathname)) {
    return true;
  }

  const hash = loc.hash || '';
  if (!hash) {
    return false;
  }

  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const pathPart = normalizedHash.split('?')[0];
  const normalizedPath = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return /(^|\/)auth\/callback(\/|$)/.test(normalizedPath);
}

function getBasePath(loc: Location) {
  const cleanedPath = loc.pathname.replace(/index\.html?$/i, '');

  if (/\/auth\/callback\/?$/.test(cleanedPath)) {
    const replaced = cleanedPath.replace(/\/auth\/callback\/?$/, '/');
    return replaced.endsWith('/') ? replaced : `${replaced}/`;
  }

  if (!cleanedPath) {
    return '/';
  }

  return cleanedPath.endsWith('/') ? cleanedPath : `${cleanedPath}/`;
}

export default function RootAuthCallbackHandler() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const { origin } = window.location;
    const isCallback = isAuthCallbackLocation(window.location);
    // Handle backend redirect to /auth/callback (non-hash) or hash-based callback.
    if (!isCallback) return;

    const cbParams = parseCallbackParams(window.location);

    async function exchange() {
      try {
        setStatus('loading');

        const basePath = getBasePath(window.location);
        const fallbackBase = DEFAULT_API_FALLBACK;
        const result = await processAuthCallback(cbParams, { fallbackBase });
        if (!result.ok) {
          setStatus('error');
          setMessage(result.message || 'Login failed.');
          return;
        }
        setStatus('success');
        setMessage(result.message || 'Login successful. Redirecting...');

        // Clean URL then navigate immediately
        const cleanedBasePath = basePath.endsWith('/')
          ? basePath
          : `${basePath}/`;
        window.history.replaceState(
          {},
          document.title,
          `${origin}${cleanedBasePath}#/`,
        );
        // Navigate hash root so components mount with token available
        navigate('/', { replace: true });
        // Short microtask delay before reload to allow react-router to settle
        setTimeout(() => window.location.reload(), 30);
      } catch (e) {
        setStatus('error');
        setMessage(`Exception processing callback: ${e}`);
      }
    }

    exchange();
  }, [navigate]);

  // Render a minimal status when on the callback path; return null otherwise
  if (!isAuthCallbackLocation(window.location)) return null;
  return (
    <Sheet sx={{ position: 'fixed', right: 12, top: 8, p: 1 }}>
      {status === 'loading' && (
        <>
          <Typography level="title-sm">Signing you in…</Typography>
          <CircularProgress size="sm" sx={{ mt: 1 }} />
        </>
      )}
      {status === 'success' && <Alert color="success">{message}</Alert>}
      {status === 'error' && <Alert color="danger">{message}</Alert>}
    </Sheet>
  );
}
