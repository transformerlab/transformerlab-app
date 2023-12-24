import { createRoot } from 'react-dom/client';
import { StoreProvider } from 'easy-peasy';
import { HashRouter } from 'react-router-dom';

import store from './store';

import App from './App';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);

root.render(
  <StoreProvider store={store}>
    <HashRouter>
      <App />
    </HashRouter>
  </StoreProvider>
);
