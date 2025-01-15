import { Box, Sheet } from '@mui/joy';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';

import useSWRSubscription from 'swr/subscription';
import type { SWRSubscriptionOptions } from 'swr/subscription';

const TERMINAL_SPEED = 100; //ms between adding each line (create an animation effect)

export default function OutputTerminal({}) {
  const terminalRef = useRef(null);
  let term: Terminal | null = null;
  let lineQueue: string[] = [];
  let isProcessing = false;

  const fitAddon = new FitAddon();

  function handleResize() {
    fitAddon.fit();
  }

  function processQueue() {
    if (lineQueue.length === 0) {
      isProcessing = false;
      return;
    }

    isProcessing = true;
    const line = lineQueue.shift()!;
    term?.writeln(line.replace(/\n$/, ''));
    if (terminalRef.current) {
      terminalRef.current.scrollIntoView({ behavior: 'smooth' });
    }

    setTimeout(() => {
      processQueue();
    }, TERMINAL_SPEED); // 100ms delay between each line
  }

  function addLinesOneByOne(lines: string[]) {
    lineQueue = lineQueue.concat(lines);
    if (!isProcessing) {
      processQueue();
    }
  }

  useEffect(() => {
    term = new Terminal({
      smoothScrollDuration: 200, // Set smooth scroll duration to 200ms
    });
    term.loadAddon(fitAddon);

    if (terminalRef.current) term.open(terminalRef.current);
    fitAddon.fit();

    window.addEventListener('resize', handleResize);

    const eventSource = new EventSource(
      'http://localhost:8338/server/stream_log'
    );
    eventSource.onmessage = (event) => {
      if (term !== null) {
        const lines = JSON.parse(event.data);
        addLinesOneByOne(lines);
      }
    };
    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
    };

    return () => {
      eventSource.close();
      term?.dispose();
      window.removeEventListener('resize', handleResize);
    };
  });

  return (
    <Box
      sx={{
        gridArea: 'footer',
        height: '100%',
        overflow: 'hidden',
        border: '10px solid #444',
        padding: '6px',
        backgroundColor: '#000',
      }}
    >
      <Sheet
        sx={{
          overflow: 'auto',
          backgroundColor: '#000',
          color: '#aaa',
          height: '100%',
        }}
        ref={terminalRef}
      ></Sheet>
    </Box>
  );
}
