// Sentry initialization should be imported first!
import './instrument';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from 'easy-peasy';
import { HashRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';

import store from './store';

import App from './App';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);

root.render(
  <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>}>
    <StoreProvider store={store}>
      <HashRouter>
        <App />
      </HashRouter>
    </StoreProvider>
  </Sentry.ErrorBoundary>,
);
