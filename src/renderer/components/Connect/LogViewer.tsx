import { Sheet } from '@mui/joy';
import { useEffect, useRef } from 'react';

import 'xterm/css/xterm.css';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

export default function LogViewer({}) {
  const terminalRef = useRef(null);

  let term: Terminal | null = null;

  useEffect(() => {
    async function fetchData() {
      setTimeout(() => {
        window.electron.ipcRenderer.sendMessage('serverLog:startListening');
      }, 1500);
      window.electron.ipcRenderer.removeAllListeners('serverLog:onUpdate');
      window.electron.ipcRenderer.on('serverLog:update', (data: any) => {
        // append data to the log-viewer div
        if (term != null) {
          term.writeln(`${data}`);
        }
      });
    }

    if (term != null) {
      term.dispose;
    } else {
      term = new Terminal();
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(terminalRef.current);
      fitAddon.fit();
    }

    fetchData();

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
    <Sheet
      sx={{
        height: '100%',
        overflow: 'auto',
        // backgroundColor: '#222',
        // color: 'white',
      }}
      ref={terminalRef}
    ></Sheet>
  );
};

