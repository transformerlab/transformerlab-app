import { useState, useCallback, useEffect } from 'react';
import { CssVarsProvider } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import Box from '@mui/joy/Box';

// import useSWR from 'swr'; // REMOVE: No longer needed here
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { IconButton } from '@mui/joy';
import Sidebar from './components/Nav/Sidebar';
import MainAppPanel from './components/MainAppPanel';
import Header from './components/Header';

import customTheme from './lib/theme';
import secretPurpleTheme from './lib/secretPurpleTheme';

import './styles.css';
import LoginModal from './components/Connect/LoginModal';

import OutputTerminal from './components/OutputTerminal';
import DraggableElipsis from './components/Shared/DraggableEllipsis';
// import OutputTerminal from './components/OutputTerminal';
import AutoUpdateModal from './components/AutoUpdateModal';
import { NotificationProvider } from './components/Shared/NotificationSystem';
import {
  ExperimentInfoProvider,
  useExperimentInfo,
} from './lib/ExperimentInfoContext';
import * as chatAPI from './lib/transformerlab-api-sdk';
import RootAuthCallbackHandler from './components/User/RootAuthCallbackHandler';
import SidebarForGPUOrchestration from './components/Nav/SidebarForGPUOrchestration';

type AppContentProps = {
  connection: string;
  logsDrawerOpen: boolean;
  setLogsDrawerOpen: (open: boolean) => void;
  logsDrawerHeight: number;
  setLogsDrawerHeight: (height: number) => void;
  themeSetter: (name: string) => void;
  setSSHConnection: (conn: any) => void;
  setConnection: (conn: string) => void;
  gpuOrchestrationServer: string;
  setGPUOrchestrationServer: (server: string) => void;
};

function AppContent({
  connection,
  logsDrawerOpen,
  setLogsDrawerOpen,
  logsDrawerHeight,
  setLogsDrawerHeight,
  themeSetter,
  setSSHConnection,
  setConnection,
  gpuOrchestrationServer,
  setGPUOrchestrationServer,
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
        gridTemplateRows: logsDrawerOpen
          ? `48px 5fr ${logsDrawerHeight}px`
          : '48px 5fr 18px',
        gridTemplateAreas: `
          "sidebar header"
          "sidebar main"
          "sidebar footer"
        `,
      })}
    >
      <Header
        connection={connection}
        setConnection={setConnection}
        gpuOrchestrationServer={gpuOrchestrationServer}
      />
      {gpuOrchestrationServer !== '' ? (
        <SidebarForGPUOrchestration
          logsDrawerOpen={logsDrawerOpen}
          setLogsDrawerOpen={setLogsDrawerOpen as any}
          themeSetter={themeSetter}
        />
      ) : (
        <Sidebar
          logsDrawerOpen={logsDrawerOpen}
          setLogsDrawerOpen={setLogsDrawerOpen as any}
          themeSetter={themeSetter}
        />
      )}
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
        <MainAppPanel
          setLogsDrawerOpen={setLogsDrawerOpen as any}
          gpuOrchestrationServer={gpuOrchestrationServer}
        />
      </Box>
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
      <AutoUpdateModal />
      <LoginModal
        setServer={setConnection}
        connection={connection}
        setTerminalDrawerOpen={setLogsDrawerOpen}
        setSSHConnection={setSSHConnection}
        setGPUOrchestrationServer={setGPUOrchestrationServer}
      />
    </Box>
  );
}

const INITIAL_LOGS_DRAWER_HEIGHT = 200; // Default height for logs drawer when first opened

export default function App() {
  const [connection, setConnection] = useState('');
  const [gpuOrchestrationServer, setGPUOrchestrationServer] = useState('');
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [logsDrawerHeight, setLogsDrawerHeight] = useState(0);
  const [theme, setTheme] = useState(customTheme);

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
        {/* Handle non-hash OAuth callback (/auth/callback) before rendering the app */}
        <RootAuthCallbackHandler />
        <ExperimentInfoProvider connection={connection}>
          <AppContent
            connection={connection}
            logsDrawerOpen={logsDrawerOpen}
            setLogsDrawerOpen={setLogsDrawerOpen}
            logsDrawerHeight={logsDrawerHeight}
            setLogsDrawerHeight={setLogsDrawerHeight}
            themeSetter={themeSetter}
            setSSHConnection={() => {}}
            setConnection={setConnection}
            gpuOrchestrationServer={gpuOrchestrationServer}
            setGPUOrchestrationServer={setGPUOrchestrationServer}
          />
        </ExperimentInfoProvider>
      </CssVarsProvider>
    </NotificationProvider>
  );
}
