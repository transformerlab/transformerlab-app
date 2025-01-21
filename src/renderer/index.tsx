import { createRoot } from 'react-dom/client';
import { StoreProvider } from 'easy-peasy';
import { HashRouter } from 'react-router-dom';
import InitColorSchemeScript from '@mui/joy/InitColorSchemeScript';

import store from './store';

import App from './App';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);

root.render(
  <StoreProvider store={store}>
    {/* <InitColorSchemeScript /> commenting out because it doesn't seem to work when I use it */}
    <HashRouter>
      <App />
    </HashRouter>
  </StoreProvider>
);
