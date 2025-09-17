/* eslint-disable prefer-template */
/* eslint-disable no-console */

export const DEFAULT_API_FALLBACK = 'http://localhost:8338/';

export type CallbackParams = {
  code: string | null;
  state: string | null;
  accessToken: string | null;
  name: string | null;
  email: string | null;
  apiUrl: string | null;
};

export type ProcessResult = { ok: boolean; message?: string };

function getHashSearchParams(loc: Location): URLSearchParams {
  const hash = loc.hash || '';
  const noHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIndex = noHash.indexOf('?');
  let qs = '';
  if (qIndex >= 0) {
    qs = noHash.slice(qIndex + 1);
  } else if (noHash.includes('=')) {
    qs = noHash;
  }
  return new URLSearchParams(qs);
}

export function parseCallbackParams(loc: Location): CallbackParams {
  const params = new URLSearchParams(loc.search || '');
  const hashParams = getHashSearchParams(loc);
  const code = params.get('code');
  const state = params.get('state');
  const accessToken = params.get('access_token') || hashParams.get('access_token');
  const name = params.get('name') || hashParams.get('name');
  const email = params.get('email') || hashParams.get('email');
  const apiUrl = params.get('api_url') || hashParams.get('api_url');
  return { code, state, accessToken, name, email, apiUrl };
}

export function ensureFallbackApiUrl(fallbackBase: string = DEFAULT_API_FALLBACK) {
  const w = window as any;
  w.TransformerLab = w.TransformerLab || {};
  if (!w.TransformerLab.API_URL) {
    w.TransformerLab.API_URL = fallbackBase;
  }
}

export function safeSetApiUrl(
  maybeUrl: string | null | undefined,
  fallbackBase: string = DEFAULT_API_FALLBACK,
  allowlistOrigins?: string[],
) {
  const w = window as any;
  w.TransformerLab = w.TransformerLab || {};
  let fallbackOrigin: string | null = null;
  try {
    fallbackOrigin = new URL(fallbackBase).origin;
  } catch {}
  try {
    if (maybeUrl) {
      const u = new URL(maybeUrl);
      const sameOrigin = u.origin === window.location.origin;
      const allowlisted = Array.isArray(allowlistOrigins)
        ? allowlistOrigins.includes(u.origin)
        : false;
      const existingRaw =
        typeof w.TransformerLab.API_URL === 'string'
          ? w.TransformerLab.API_URL
          : null;
      let existingOrigin: string | null = null;
      if (existingRaw) {
        try {
          existingOrigin = new URL(existingRaw).origin;
        } catch {}
      }

      if (
        sameOrigin &&
        existingOrigin &&
        existingOrigin !== window.location.origin &&
        (!fallbackOrigin || existingOrigin !== fallbackOrigin)
      ) {
        return;
      }

      if (sameOrigin || allowlisted) {
        const path = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';
        w.TransformerLab.API_URL = u.origin + path;
        return;
      }
    }
  } catch {}
  if (!w.TransformerLab.API_URL) {
    w.TransformerLab.API_URL = fallbackBase;
  }
}

export async function storeProfile(params: {
  accessToken?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  const w: any = window as any;
  if (params.accessToken) await w.storage.set('accessToken', params.accessToken);
  if (params.name) await w.storage.set('userName', params.name);
  if (params.email) await w.storage.set('userEmail', params.email);
}

export async function processAuthCallback(
  cb: CallbackParams,
  opts: { fallbackBase?: string; allowlistOrigins?: string[] },
): Promise<ProcessResult> {
  try {
    const { fallbackBase = DEFAULT_API_FALLBACK, allowlistOrigins } = opts;
  const w: any = window as any;
  const expectedState = await w.storage.get('authWorkosState');

    // Updated state validation logic:
    // Some providers / flows may return an implicit access_token *without* echoing back the state.
    // Original logic rejected this (causing white screen + requiring refresh). We now:
    // 1. Validate state only if BOTH expectedState and cb.state are present.
    // 2. If we have an access_token and expectedState but no cb.state, accept it (best-effort) and clear stored state.
    // 3. If we have a code (authorization code flow) and expectedState but missing cb.state, treat as error (more sensitive path).
    let requiresStateValidation = Boolean(expectedState && cb.state);

  if (expectedState && cb.accessToken && !cb.state) {
      // Implicit flow without state returned; accept token and proceed.
  await w.storage.delete('authWorkosState');
      requiresStateValidation = false;
    } else if (requiresStateValidation) {
      if (expectedState !== cb.state) {
  await w.storage.delete('authWorkosState');
        return { ok: false, message: 'Login failed: invalid state parameter.' };
      }
  await w.storage.delete('authWorkosState');
    } else if (expectedState && cb.code && !cb.state) {
      // Authorization code flow should return state; fail fast.
  await w.storage.delete('authWorkosState');
      return { ok: false, message: 'Login failed: missing state parameter.' };
    }

    // Apply API_URL hint if provided; else ensure fallback is set for first-time
    if (cb.apiUrl) {
      safeSetApiUrl(cb.apiUrl, fallbackBase, allowlistOrigins);
    } else {
      ensureFallbackApiUrl(fallbackBase);
    }

    const apiBase =
      ((window as any).TransformerLab && (window as any).TransformerLab.API_URL) ||
      fallbackBase;

    // If token is present in URL, just store and finish
    if (cb.accessToken) {
      await storeProfile({ accessToken: cb.accessToken, name: cb.name, email: cb.email });
      return { ok: true, message: 'Login successful. Redirecting...' };
    }

    if (!cb.accessToken && cb.code) {
      const response = await fetch(`${apiBase}auth/workos/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cb.code, state: cb.state }),
        credentials: 'include',
      });

      if (!response.ok) {
        return { ok: false, message: 'SSO exchange failed.' };
      }

      let data: any = null;
      try {
        data = await response.json();
      } catch (e) {
        return { ok: false, message: 'SSO exchange failed: invalid server response.' };
      }

      const { access_token: exchangedToken, name, email, api_url: apiUrlHint } = data || {};
      if (apiUrlHint) {
        safeSetApiUrl(apiUrlHint, fallbackBase, allowlistOrigins);
      }

      if (!exchangedToken) {
        return { ok: false, message: 'SSO exchange failed: missing access token.' };
      }

      await storeProfile({ accessToken: exchangedToken, name, email });
      return { ok: true, message: 'Login successful. Redirecting...' };
    }

    return { ok: false, message: 'Missing authorization code or token in callback URL.' };
  } catch (e) {
    return { ok: false, message: `Exception processing callback: ${e}` };
  }
}
