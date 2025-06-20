import { createRoot } from 'react-dom/client';
import { StoreProvider } from 'easy-peasy';
import { HashRouter } from 'react-router-dom';

import store from './store';

import App from './App';
import { AnalyticsProvider } from './components/Shared/analytics/AnalyticsContext';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);

root.render(
  <StoreProvider store={store}>
    <HashRouter>
      <AnalyticsProvider>
        <App />
      </AnalyticsProvider>
    </HashRouter>
  </StoreProvider>,
);
