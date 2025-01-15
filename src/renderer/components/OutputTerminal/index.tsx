import { Box, Sheet } from '@mui/joy';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';

export default function OutputTerminal({}) {
  const terminalRef = useRef(null);
  let term: Terminal | null = null;

  const fitAddon = new FitAddon();

  function handleResize() {
    fitAddon.fit();
  }

  useEffect(() => {
    // This is hardcoded to local for now -- just building
    var source = new EventSource('http://localhost:8338/server/stream_log');
    source.onmessage = function (event) {
      // console.log(event.data);
      // var logs = document.getElementById('logs');
      // logs.innerHTML += event.data + '<br>';
      // // Scroll to bottom
      // logs.scrollTop = document.getElementById('logs').scrollHeight;

      if (term !== null) {
        console.log(event.data);
        const lines = JSON.parse(event.data);
        console.log(lines);
        lines.forEach((line: string) => {
          term.writeln(line);
          if (terminalRef.current) {
            terminalRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        });
      }
      window.addEventListener('resize', handleResize);
    };

    term = new Terminal();
    term.loadAddon(fitAddon);

    if (terminalRef.current) term.open(terminalRef.current);
    fitAddon.fit();

    window.addEventListener('resize', handleResize);

    return () => {
      term?.dispose();
      source.close();
      window.removeEventListener('resize', handleResize);
    };
  });

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <Sheet
        sx={{
          gridArea: 'terminal',
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
