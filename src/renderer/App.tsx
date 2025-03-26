import { useState, useEffect, useCallback } from 'react';
import { CssVarsProvider } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import Box from '@mui/joy/Box';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
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

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function App() {
  const [experimentId, setExperimentId] = useState('');

  const [connection, setConnection] = useState('');

  const [sshConnection, setSSHConnection] = useState(null);

  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [logsDrawerHeight, setLogsDrawerHeight] = useState(0);

  const [theme, setTheme] = useState(customTheme);

  useEffect(() => {
    async function getSavedExperimentId() {
      const connectionWithoutDots = connection.replace(/\./g, '-');
      // window.storage should be defined by cloud or electron preload script
      const experimentId = window.storage
        ? await window.storage.get(`experimentId.${connectionWithoutDots}`)
        : 1;
      if (experimentId) {
        setExperimentId(experimentId);
      } else if (connection !== '') {
        // If there's no stored experiment and we are connected
        // then default to to the first experiment
        setExperimentId(1);
      }
    }

    if (!window.TransformerLab) {
      window.TransformerLab = {};
    }

    window.TransformerLab.API_URL = connection;

    if (connection == '') {
      setExperimentId('');
      return;
    }

    getSavedExperimentId();
  }, [connection]);

  useEffect(() => {
    // if there is no experiment or window.storage isn't setup then skip
    if (experimentId == '' || !window.storage) return;
    const connectionWithoutDots = connection.replace(/\./g, '-');
    window.storage.set(`experimentId.${connectionWithoutDots}`, experimentId);
  }, [experimentId]);

  useEffect(() => {
    if (logsDrawerOpen) {
      setLogsDrawerHeight(200);
    }
  }, [logsDrawerOpen]);

  // Fetch the experiment info, if the experimentId changes
  const {
    data: experimentInfo,
    error: experimentInfoError,
    isLoading: experimentInfoIsLoading,
    mutate: experimentInfoMutate,
  } = useSWR(chatAPI.GET_EXPERIMENT_URL(experimentId), fetcher);

  const onOutputDrawerDrag = useCallback((pos) => {
    const ypos = pos.y;
    // calculate how far from the bottom of the screen that ypos is:
    let bottom = window.innerHeight - ypos;

    // now clamp the height so it is between 0 and the screen height - 200px
    // (200px is the minimum height of the logs drawer)
    if (bottom < 120) {
      bottom = 120;
    }
    if (bottom > window.innerHeight / 2) {
      bottom = window.innerHeight / 2;
    }

    // now set the height of the logs drawer to be that distance
    setLogsDrawerHeight(bottom);
  }, []);

  const themeSetter = useCallback((name: string) => {
    if (name === 'purple') {
      setTheme(secretPurpleTheme);
    } else {
      setTheme(customTheme);
    }
  }, []);

  return (
    <CssVarsProvider disableTransitionOnChange theme={theme}>
      <CssBaseline />
      <Box
        component="main"
        className="MainContent"
        sx={() => ({
          display: 'grid',
          height: '100dvh',
          width: '100dvw',
          overflow: 'hidden',
          gridTemplateColumns: '220px 1fr',
          gridTemplateRows: logsDrawerOpen
            ? `60px 5fr ${logsDrawerHeight}px`
            : '60px 5fr 18px',
          gridTemplateAreas: `
          "sidebar header"
          "sidebar main"
          "sidebar footer"
          `,
          // backgroundColor: (theme) => theme.vars.palette.background.surface,
        })}
      >
        <Header
          connection={connection}
          setConnection={setConnection}
          experimentInfo={experimentInfo}
        />
        {/* <FirstSidebar setDrawerOpen={setDrawerOpen} /> */}

        <Sidebar
          experimentInfo={experimentInfo}
          setExperimentId={setExperimentId}
          logsDrawerOpen={logsDrawerOpen}
          setLogsDrawerOpen={setLogsDrawerOpen}
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
          <MainAppPanel
            experimentInfo={experimentInfo}
            setExperimentId={setExperimentId}
            experimentInfoMutate={experimentInfoMutate}
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
            <OutputTerminal initialMessage="** Running a Model will Display Output Here **" />
          </Box>
        </Box>
        <AutoUpdateModal />
        <LoginModal
          setServer={setConnection}
          connection={connection}
          setTerminalDrawerOpen={setLogsDrawerOpen}
          setSSHConnection={setSSHConnection}
        />
      </Box>
    </CssVarsProvider>
  );
}
