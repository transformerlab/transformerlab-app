import * as Sentry from '@sentry/react';

if (process.env.SENTRY_DSN) {
  const enableTracing = process.env.SENTRY_ENABLE_TRACING === 'true';
  const apiUrl = process.env.TL_API_URL || 'localhost';

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
    tracePropagationTargets: enableTracing ? ['localhost', apiUrl] : [],
  });
}
