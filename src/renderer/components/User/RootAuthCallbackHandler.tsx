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
        // Set sessionStorage flag to persist login state across reload
        // Also store timestamp for timeout detection
        sessionStorage.setItem('isLoggingIn', 'true');
        sessionStorage.setItem('isLoggingInStartTime', Date.now().toString());

        const basePath = getBasePath(window.location);
        const fallbackBase = DEFAULT_API_FALLBACK;
        const result = await processAuthCallback(cbParams, { fallbackBase });
        if (!result.ok) {
          setStatus('error');
          setMessage(result.message || 'Login failed.');
          sessionStorage.removeItem('isLoggingIn');
          sessionStorage.removeItem('isLoggingInStartTime');
          return;
        }

        // Wait for auth/me to complete before showing success/reloading
        // This ensures the login state persists until user info is loaded
        const apiBase =
          ((window as any).TransformerLab &&
            (window as any).TransformerLab.API_URL) ||
          fallbackBase;

        // Poll for auth/me to succeed (with timeout)
        // This handles both token-based and session-based auth
        let attempts = 0;
        const maxAttempts = 20; // 10 seconds max wait
        let authSuccess = false;

        while (attempts < maxAttempts && !authSuccess) {
          try {
            const accessToken = await (window as any).storage?.get(
              'accessToken',
            );
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            // Include token if available (for token-based auth)
            if (accessToken) {
              headers.Authorization = `Bearer ${accessToken}`;
            }

            // Use credentials: 'include' to send session cookies (for session-based auth)
            const response = await fetch(`${apiBase}auth/me`, {
              method: 'GET',
              headers,
              credentials: 'include',
            });

            if (response.ok) {
              const userData = await response.json();
              if (userData?.authenticated) {
                authSuccess = true;
                break;
              }
            }
          } catch (e) {
            // Continue polling on error
          }

          attempts++;
          // Wait 500ms between attempts
          await new Promise((resolve) => setTimeout(resolve, 500));
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
        // Note: sessionStorage flag will persist across reload and be cleared by Sidebar component
        setTimeout(() => window.location.reload(), 30);
      } catch (e) {
        setStatus('error');
        setMessage(`Exception processing callback: ${e}`);
        sessionStorage.removeItem('isLoggingIn');
        sessionStorage.removeItem('isLoggingInStartTime');
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
