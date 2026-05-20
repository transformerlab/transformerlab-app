import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * Auth smoke tests: exercise the fastapi-users / FastAPI auth surface
 * directly over HTTP.
 *
 * These live in the `smoke` project (see playwright.config.ts) because:
 *   - Every other spec depends on login() succeeding. An auth regression
 *     should fail loudly here with a clear status code from a specific
 *     endpoint, not as a confusing selector miss deep in another spec.
 *   - FastAPI and fastapi-users are pre-1.0. Their minor bumps can change
 *     response shapes or routing behavior without major-version warning.
 *     These tests pin down the contracts we depend on so a Dependabot
 *     bump (e.g. PR #2176 bumping fastapi 0.125 -> 0.136) surfaces breakage
 *     before it reaches users.
 *
 * Coverage:
 *   - fastapi-users auth router: POST /auth/jwt/login (success + bad creds)
 *   - Our custom CurrentUserResponse shape on GET /users/me
 *   - GET /users/me/teams (the source of X-Team-Id for every other call)
 *   - Our custom refresh-token rotation at POST /auth/refresh
 *   - The JWT + X-Team-Id pipeline via GET /users/me/secrets
 *   - OAuth/OIDC status endpoints the login page reads
 *
 * Assumes the seeded admin user (admin@example.com / admin123) exists,
 * same as every other spec.
 */

const EMAIL = 'admin@example.com';
const PASSWORD = 'admin123';

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

async function login(request: APIRequestContext): Promise<LoginResponse> {
  const res = await request.post('/auth/jwt/login', {
    form: { username: EMAIL, password: PASSWORD },
  });
  expect(res.status(), 'admin login should succeed').toBe(200);
  return (await res.json()) as LoginResponse;
}

test.describe('Auth: fastapi-users contract', () => {
  test('POST /auth/jwt/login returns access + refresh tokens', async ({
    request,
  }) => {
    const res = await request.post('/auth/jwt/login', {
      form: { username: EMAIL, password: PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('refresh_token');
    expect(body.token_type).toBe('bearer');
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(20);
    expect(typeof body.refresh_token).toBe('string');
    expect(body.refresh_token.length).toBeGreaterThan(20);
  });

  test('POST /auth/jwt/login rejects an invalid password', async ({
    request,
  }) => {
    const res = await request.post('/auth/jwt/login', {
      form: { username: EMAIL, password: 'definitely-not-the-password' },
    });
    // fastapi-users returns 400 (LOGIN_BAD_CREDENTIALS) for bad creds; accept
    // 401 as well in case fastapi-users tightens that in a future minor.
    expect([400, 401]).toContain(res.status());
  });

  test('GET /users/me requires authentication', async ({ request }) => {
    const res = await request.get('/users/me');
    expect(res.status()).toBe(401);
  });

  test('GET /users/me rejects a malformed bearer token', async ({
    request,
  }) => {
    const res = await request.get('/users/me', {
      headers: { Authorization: 'Bearer not.a.real.token' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /users/me returns CurrentUserResponse shape for the admin user', async ({
    request,
  }) => {
    const { access_token } = await login(request);
    const res = await request.get('/users/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(EMAIL);
    expect(body.is_active).toBe(true);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('is_superuser');
    expect(body).toHaveProperty('is_verified');
    // Custom field added to CurrentUserResponse in routers/auth.py — would
    // catch a Pydantic / response_model serialization regression after a
    // FastAPI bump.
    expect(body).toHaveProperty('is_default_password');
  });

  test('GET /users/me/teams returns at least one team for the admin user', async ({
    request,
  }) => {
    const { access_token } = await login(request);
    const res = await request.get('/users/me/teams', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('user_id');
    expect(Array.isArray(body.teams)).toBe(true);
    expect(body.teams.length).toBeGreaterThan(0);
    // Every other E2E test reads this shape to source X-Team-Id, so the
    // contract matters.
    const team = body.teams[0];
    expect(team).toHaveProperty('id');
    expect(team).toHaveProperty('name');
    expect(team).toHaveProperty('role');
  });
});

test.describe('Auth: refresh-token rotation', () => {
  test('POST /auth/refresh rotates both tokens and the new access token works', async ({
    request,
  }) => {
    const initial = await login(request);

    const res = await request.post('/auth/refresh', {
      data: { refresh_token: initial.refresh_token },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('refresh_token');
    expect(body.token_type).toBe('bearer');
    // Rotation is the whole point of the endpoint — both tokens should be
    // freshly issued.
    expect(body.access_token).not.toBe(initial.access_token);
    expect(body.refresh_token).not.toBe(initial.refresh_token);

    // The newly issued access token should authenticate against /users/me.
    const check = await request.get('/users/me', {
      headers: { Authorization: `Bearer ${body.access_token}` },
    });
    expect(check.status()).toBe(200);
  });

  test('POST /auth/refresh rejects an invalid refresh token', async ({
    request,
  }) => {
    const res = await request.post('/auth/refresh', {
      data: { refresh_token: 'not-a-real-refresh-token' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Auth: JWT + X-Team-Id dependency pipeline', () => {
  // /users/me/secrets goes through the get_user_and_team dependency, so it
  // covers both JWT validation AND the X-Team-Id resolution path. If either
  // breaks after a FastAPI bump, this is where we'll see it.

  test('Protected endpoint requires X-Team-Id when using JWT', async ({
    request,
  }) => {
    const { access_token } = await login(request);
    const res = await request.get('/users/me/secrets', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    // get_user_and_team raises 400 when neither X-Team-Id nor team cookie
    // is present.
    expect(res.status()).toBe(400);
  });

  test('Protected endpoint succeeds with valid bearer + X-Team-Id', async ({
    request,
  }) => {
    const { access_token } = await login(request);

    const teamsRes = await request.get('/users/me/teams', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const teams = await teamsRes.json();
    const teamId: string = teams.teams[0].id;
    expect(teamId, 'expected a team id to drive X-Team-Id with').toBeTruthy();

    const res = await request.get('/users/me/secrets', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'X-Team-Id': teamId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body).toHaveProperty('secret_keys');
  });
});

test.describe('Auth: OAuth / OIDC status endpoints', () => {
  // These are no-auth endpoints the login page hits to decide which sign-in
  // buttons to render. They're trivially simple, but they exercise the
  // include_router / GET-route mounting that a FastAPI bump could break.

  test('GET /auth/google/status responds with { enabled: bool }', async ({
    request,
  }) => {
    const res = await request.get('/auth/google/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.enabled).toBe('boolean');
  });

  test('GET /auth/github/status responds with { enabled: bool }', async ({
    request,
  }) => {
    const res = await request.get('/auth/github/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.enabled).toBe('boolean');
  });

  test('GET /auth/oidc/providers responds with { enabled, providers[] }', async ({
    request,
  }) => {
    const res = await request.get('/auth/oidc/providers');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.enabled).toBe('boolean');
    expect(Array.isArray(body.providers)).toBe(true);
  });
});
