/// <reference types="vite/client" />

declare module '*.svg' {
  import * as React from 'react';
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  const src: string;
  export default src;
}

declare module '*.svg?react' {
  import * as React from 'react';
  const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  export default ReactComponent;
}

interface ImportMetaEnv {
  readonly VITE_TL_API_URL: string;
  readonly VITE_MULTIUSER: string;
  readonly VITE_EMAIL_AUTH_ENABLED: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_SENTRY_ENABLE_TRACING: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
