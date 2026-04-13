import { useState, useCallback, useEffect } from 'react';
import { CssVarsProvider } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import Box from '@mui/joy/Box';

import Sidebar from './components/Nav/Sidebar';
import MainAppPanel from './components/MainAppPanel';

import customTheme from './lib/theme';
import secretPurpleTheme from './lib/secretPurpleTheme';

import './styles.css';

import AnnouncementBanner from './components/Shared/AnnouncementBanner';
import InsecurePasswordBanner from './components/Shared/InsecurePasswordBanner';
import VersionUpdateBanner from './components/Shared/VersionUpdateBanner';
import { NotificationProvider } from './components/Shared/NotificationSystem';
import { ExperimentInfoProvider } from './lib/ExperimentInfoContext';
import * as chatAPI from './lib/transformerlab-api-sdk';
import { AuthProvider, useAuth } from './lib/authContext';
import LoginPage from './components/Login/LoginPage';
import { AnalyticsProvider } from './components/Shared/analytics/AnalyticsContext';
import FullPageLoader from './components/Shared/FullPageLoader';
import ConnectionLostModal from './components/Shared/ConnectionLostModal';

type AppContentProps = {
  connection: string;
  setConnection: (conn: string) => void;
  setLogsDrawerOpen: (open: boolean) => void;
  themeSetter: (name: string) => void;
};

function AppContent({
  connection,
  setConnection,
  setLogsDrawerOpen,
  themeSetter,
}: AppContentProps) {
  const authContext = useAuth();
  const { isError: connectionHealthError, isLoading: connectionHealthLoading } =
    chatAPI.useConnectionHealth(connection);

  const showConnectionLostModal =
    connection !== '' && !connectionHealthLoading && !!connectionHealthError;

  // While auth is initializing or the initial user info is loading, show a full-page loader.
  // We only block on the *first* user load (no user/error yet) so that revalidation
  // or transient refetches don't cause the login page to briefly disappear.
  const isInitialUserLoad =
    authContext.userIsLoading && !authContext.user && !authContext.userError;

  if (authContext.initializing || isInitialUserLoad) {
    return <FullPageLoader />;
  }

  if (!authContext?.isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: '100dvw',
        overflow: 'hidden',
      }}
    >
      <InsecurePasswordBanner />
      <Box
        component="main"
        className="MainContent"
        sx={() => ({
          display: 'grid',
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          gridTemplateColumns: '180px 1fr',
          gridTemplateRows: '1fr',
          gridTemplateAreas: `
          "sidebar main"
        `,
        })}
      >
        <Sidebar
          setLogsDrawerOpen={setLogsDrawerOpen as any}
          themeSetter={themeSetter}
        />
        <Box
          sx={{
            px: {
              sm: 1,
              md: 1,
              lg: 1,
            },
            pt: 1,
            pb: 0,
            height: '100%',
            gridArea: 'main',
            overflow: 'hidden',
            backgroundColor: 'var(--joy-palette-background-surface)',
            display: 'flex',
            flexDirection: 'column',
          }}
          id="main-app-panel"
        >
          <AnnouncementBanner />
          <VersionUpdateBanner />
          <MainAppPanel setLogsDrawerOpen={setLogsDrawerOpen as any} />
        </Box>
        {showConnectionLostModal && (
          <ConnectionLostModal
            connection={connection}
            setConnection={setConnection}
          />
        )}
      </Box>
    </Box>
  );
}

export default function App() {
  // Normalize TL_API_URL - ensure it's either a valid URL or default sensibly based on environment
  const initialApiUrl = (() => {
    const envUrl = process.env?.TL_API_URL;
    // If undefined, null, or the string "default", choose a fallback:
    // - For localhost or frontend port 1212, assume API is on port 8338 (Electron dev)
    // - For non-localhost, assume API is served from the same origin as the frontend
    if (!envUrl || envUrl === 'default' || envUrl.trim() === '') {
      const { protocol, hostname, port } = window.location;

      // Local dev: API runs on 8338 even if frontend uses another port
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${protocol}//${hostname}:8338/`;
      }

      // Local dev: frontend often on 1212, API on 8338
      if (port === '1212') {
        return `${protocol}//${hostname}:8338/`;
      }

      // Cloud/hosted: assume API is available on the same origin as the frontend
      const isDefaultHttpPort = port === '' || port === '80';
      const isDefaultHttpsPort = port === '' || port === '443';
      const isDefaultPort =
        (protocol === 'http:' && isDefaultHttpPort) ||
        (protocol === 'https:' && isDefaultHttpsPort);

      if (isDefaultPort) {
        return `${protocol}//${hostname}/`;
      }

      return `${protocol}//${hostname}:${port}/`;
    }
    // Ensure the URL has a trailing slash
    let url = envUrl.trim();
    if (!url.endsWith('/')) {
      url += '/';
    }
    return url;
  })();

  const [connection, setConnection] = useState(initialApiUrl);
  const [, setLogsDrawerOpen] = useState(false);
  const [theme, setTheme] = useState(customTheme);

  useEffect(() => {
    window.TransformerLab = {};
    window.TransformerLab.API_URL = initialApiUrl;
  }, [initialApiUrl]);

  const themeSetter = useCallback((name: string) => {
    if (name === 'purple') {
      setTheme(secretPurpleTheme);
    } else {
      setTheme(customTheme);
    }
  }, []);

  return (
    <NotificationProvider>
      <CssVarsProvider disableTransitionOnChange theme={theme}>
        <CssBaseline />
        <AuthProvider connection={connection}>
          <AnalyticsProvider>
            <ExperimentInfoProvider connection={connection}>
              <AppContent
                connection={connection}
                setConnection={setConnection}
                setLogsDrawerOpen={setLogsDrawerOpen}
                themeSetter={themeSetter}
              />
            </ExperimentInfoProvider>
          </AnalyticsProvider>
        </AuthProvider>
      </CssVarsProvider>
    </NotificationProvider>
  );
}
