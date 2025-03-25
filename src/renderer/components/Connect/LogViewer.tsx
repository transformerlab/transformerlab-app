import { Box, Button, Sheet } from '@mui/joy';
import { useEffect, useRef } from 'react';

import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export default function LogViewer({
  triggerStrings = [],
  triggerFunction = () => { },
}) {
  const terminalRef = useRef(null);
  let term: Terminal | null = null;

  const fitAddon = new FitAddon();

  function handleResize() {
    fitAddon.fit();
  }

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
      term.loadAddon(fitAddon);

      term.open(terminalRef.current);
      fitAddon.fit();

      setTimeout(() => {
        window.electron.ipcRenderer.sendMessage('serverLog:startListening');
      }, 100);
      window.electron.ipcRenderer.removeAllListeners('serverLog:onUpdate');
      console.log('Listening for server log updates');
      window.electron.ipcRenderer.on('serverLog:update', (data: any) => {
        // append data to the log-viewer div
        if (term != null) {
          term.writeln(`${data}`);
        }

        // Go through each trigger string and see if it is in the data
        if (triggerStrings.length > 0) {
          for (let i = 0; i < triggerStrings.length; i++) {
            if (data.includes(triggerStrings[i])) {
              triggerFunction(data);
            }
          }
        }
      });
      window.addEventListener('resize', handleResize);
    }

    return () => {
      //send message to stop the server log listening service:
      window.electron.ipcRenderer.sendMessage('serverLog:stopListening');
      window.electron.ipcRenderer.removeAllListeners(
        'serverLog:startListening'
      );
      window.electron.ipcRenderer.removeAllListeners('serverLog:onUpdate');
      console.log('Stopped listening for server log updates');
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <Sheet
        sx={{
          height: '100%',
          overflow: 'auto',
          backgroundColor: '#222',
          // color: 'white',
        }}
        ref={terminalRef}
      ></Sheet>
    </Box>
  );
}
