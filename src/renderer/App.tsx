import { useState, useCallback, useEffect } from 'react';
import { CssVarsProvider } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import Box from '@mui/joy/Box';

// import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext'; // REMOVE: No longer needed here
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { IconButton } from '@mui/joy';
import Sidebar from './components/Nav/Sidebar';
import MainAppPanel from './components/MainAppPanel';
import Header from './components/Header';

import customTheme from './lib/theme';
import secretPurpleTheme from './lib/secretPurpleTheme';

import './styles.css';

import OutputTerminal from './components/OutputTerminal';
import DraggableElipsis from './components/Shared/DraggableEllipsis';
import AnnouncementsModal from './components/Shared/AnnouncementsModal';
import { NotificationProvider } from './components/Shared/NotificationSystem';
import {
  ExperimentInfoProvider,
  useExperimentInfo,
} from './lib/ExperimentInfoContext';
import * as chatAPI from './lib/transformerlab-api-sdk';
import { AuthProvider, useAuth } from './lib/authContext';
import LoginPage from './components/Login/LoginPage';
import { AnalyticsProvider } from './components/Shared/analytics/AnalyticsContext';

type AppContentProps = {
  connection: string;
  logsDrawerOpen: boolean;
  setLogsDrawerOpen: (open: boolean) => void;
  logsDrawerHeight: number;
  setLogsDrawerHeight: (height: number) => void;
  themeSetter: (name: string) => void;
  setConnection: (conn: string) => void;
};

function AppContent({
  connection,
  logsDrawerOpen,
  setLogsDrawerOpen,
  logsDrawerHeight,
  setLogsDrawerHeight,
  themeSetter,
  setConnection,
}: AppContentProps) {
  const onOutputDrawerDrag = useCallback(
    (pos: { y: number }) => {
      const ypos = pos.y;
      let bottom = window.innerHeight - ypos;
      if (bottom < 120) bottom = 120;
      if (bottom > window.innerHeight / 2) bottom = window.innerHeight / 2;
      setLogsDrawerHeight(bottom);
    },
    [setLogsDrawerHeight],
  );

  const authContext = useAuth();

  const isLocalMode = window?.platform?.multiuser !== true;

  // Show LoginPage when:
  // 1. Multi-user mode is enabled AND user is not authenticated
  // 2. OR user is not authenticated but has a connection (meaning auto-login failed)
  // In cloud mode, connection should be set via environment variable or direct URL
  if (!authContext?.isAuthenticated) {
    // In multi-user mode, always show LoginPage
    if (process.env.MULTIUSER === 'true') {
      return <LoginPage />;
    }
    // If we have a connection but aren't authenticated, show LoginPage
    // (connection was established but auto-login failed)
    if (connection && connection !== '') {
      return <LoginPage />;
    }
    // If no connection, show nothing (connection should be set via env var in cloud mode)
    return null;
  }

  return (
    <Box
      component="main"
      className="MainContent"
      sx={() => ({
        display: 'grid',
        height: '100dvh',
        width: '100dvw',
        overflow: 'hidden',
        gridTemplateColumns: '180px 1fr',
        gridTemplateRows: !isLocalMode
          ? '48px 5fr'
          : logsDrawerOpen
            ? `48px 5fr ${logsDrawerHeight}px`
            : '48px 5fr 18px',
        gridTemplateAreas: !isLocalMode
          ? `
          "sidebar header"
          "sidebar main"
        `
          : `
          "sidebar header"
          "sidebar main"
          "sidebar footer"
        `,
      })}
    >
      <Header connection={connection} setConnection={setConnection} />
      <Sidebar
        logsDrawerOpen={logsDrawerOpen}
        setLogsDrawerOpen={setLogsDrawerOpen as any}
        themeSetter={themeSetter}
      />
      <Box
        sx={{
          px: {
            md: 3,
            lg: 4,
          },
          pt: 2,
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
        <MainAppPanel setLogsDrawerOpen={setLogsDrawerOpen as any} />
      </Box>
      {isLocalMode && (
        <Box
          sx={{
            gridArea: 'footer',
            display: 'flex',
            flexDirection: 'column',
            height: logsDrawerOpen ? '100%' : '18px',
            width: '100%',
            overflow: 'hidden',
            alignItems: 'stretch',
            backgroundColor: 'var(--joy-palette-background-level3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              height: '18px',
              lineHeight: '18px',
            }}
          >
            <div>&nbsp;</div>
            {logsDrawerOpen ? (
              <DraggableElipsis notifyOnMove={onOutputDrawerDrag} />
            ) : (
              <>&nbsp;</>
            )}
            <IconButton
              sx={{ padding: 0, margin: 0, minHeight: 0 }}
              onClick={() => setLogsDrawerOpen(!logsDrawerOpen)}
            >
              {logsDrawerOpen ? (
                <ChevronDownIcon size="18px" />
              ) : (
                <ChevronUpIcon size="18px" />
              )}
            </IconButton>
          </div>
          <Box
            sx={{
              height: logsDrawerOpen ? '100%' : '0px',
              overflow: 'hidden',
              border: logsDrawerOpen ? '10px solid #444' : '0',
              padding: logsDrawerOpen ? '6px' : '0',
              backgroundColor: '#000',
              width: '100%',
            }}
          >
            <OutputTerminal
              key={connection}
              logEndpoint={chatAPI.Endpoints.ServerInfo.StreamLog()}
              initialMessage="** Running a Model will Display Output Here **"
            />
          </Box>
        </Box>
      )}
      <AnnouncementsModal />
    </Box>
  );
}

const INITIAL_LOGS_DRAWER_HEIGHT = 200; // Default height for logs drawer when first opened

export default function App() {
  // Normalize TL_API_URL - ensure it's either a valid URL or default to same host as frontend
  const initialApiUrl = (() => {
    const envUrl = process.env?.TL_API_URL;
    // If undefined, null, or the string "default", use same host as frontend with API port
    if (!envUrl || envUrl === 'default' || envUrl.trim() === '') {
      // Use the same protocol and hostname as the frontend, but with API port 8338
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      return `${protocol}//${hostname}:8338/`;
    }
    // Ensure the URL has a trailing slash
    let url = envUrl.trim();
    if (!url.endsWith('/')) {
      url = url + '/';
    }
    return url;
  })();

  const [connection, setConnection] = useState(initialApiUrl);
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [logsDrawerHeight, setLogsDrawerHeight] = useState(0);
  const [theme, setTheme] = useState(customTheme);

  useEffect(() => {
    window.TransformerLab = {};
    window.TransformerLab.API_URL = initialApiUrl;
  }, [initialApiUrl]);

  // if the logs drawer is open, set the initial height
  useEffect(() => {
    if (logsDrawerOpen) {
      setLogsDrawerHeight(INITIAL_LOGS_DRAWER_HEIGHT);
    }
  }, [logsDrawerOpen]);

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
                logsDrawerOpen={logsDrawerOpen}
                setLogsDrawerOpen={setLogsDrawerOpen}
                logsDrawerHeight={logsDrawerHeight}
                setLogsDrawerHeight={setLogsDrawerHeight}
                themeSetter={themeSetter}
                setConnection={setConnection}
              />
            </ExperimentInfoProvider>
          </AnalyticsProvider>
        </AuthProvider>
      </CssVarsProvider>
    </NotificationProvider>
  );
}
