import React, { Suspense, lazy } from 'react';
import { CircularProgress } from '@mui/joy';
import type { EditorProps } from '@monaco-editor/react';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
);

function EditorFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        minHeight: 200,
      }}
    >
      <CircularProgress size="sm" />
    </div>
  );
}

export default function LazyMonacoEditor(props: EditorProps) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <MonacoEditor {...props} />
    </Suspense>
  );
}
