import { Box, Sheet } from '@mui/joy';
import { useEffect, useRef } from 'react';

import 'xterm/css/xterm.css';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

export default function LogViewer({}) {
  const terminalRef = useRef(null);
  let term: Terminal | null = null;

  useEffect(() => {
    // see if you can find any DOM elements with class "xterm" and remove them
    // I don't know why they are left behind, but this is a workaround
    const xtermElements = document.getElementsByClassName('xterm');
    if (xtermElements.length > 0) {
      for (let i = 0; i < xtermElements.length; i++) {
        xtermElements[i].remove();
      }
    }

    if (term != null) {
      term.dispose;
      console.log('disposed terminal');
    } else {
      term = new Terminal();
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(terminalRef.current);
      fitAddon.fit();

      setTimeout(() => {
        window.electron.ipcRenderer.sendMessage('serverLog:startListening');
      }, 1500);
      window.electron.ipcRenderer.removeAllListeners('serverLog:onUpdate');
      console.log('Listening for server log updates');
      window.electron.ipcRenderer.on('serverLog:update', (data: any) => {
        // append data to the log-viewer div
        if (term != null) {
          term.writeln(`${data}`);
        }
      });
    }

    return () => {
      //send message to stop the server log listening service:
      window.electron.ipcRenderer.sendMessage('serverLog:stopListening');
      window.electron.ipcRenderer.removeAllListeners(
        'serverLog:startListening'
      );
      window.electron.ipcRenderer.removeAllListeners('serverLog:onUpdate');
    };
  }, []);

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <Sheet
        sx={{
          height: '100%',
          overflow: 'auto',
          // backgroundColor: '#222',
          // color: 'white',
        }}
        ref={terminalRef}
      ></Sheet>
    </Box>
  );
}
