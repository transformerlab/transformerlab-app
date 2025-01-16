import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { Sheet } from '@mui/joy';

// Debounce function
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

const OutputTerminal = ({
  logEndpoint = chatAPI.Endpoints.ServerInfo.StreamLog(),
  lineAnimationDelay = 100,
  initialMessage = '',
}) => {
  const terminalRef = useRef(null);
  let term: Terminal | null = null;
  let lineQueue: string[] = [];
  let isProcessing = false;

  const fitAddon = new FitAddon();

  const handleResize = debounce(() => {
    fitAddon.fit();
  }, 300);

  const processQueue = () => {
    if (lineQueue.length === 0) {
      isProcessing = false;
      return;
    }

    isProcessing = true;
    const line = lineQueue.shift()!;
    term?.write(line.replace(/\n$/, '\r\n'));
    if (terminalRef.current) {
      terminalRef.current.scrollIntoView({ behavior: 'smooth' });
    }

    setTimeout(() => {
      processQueue();
    }, lineAnimationDelay); // 100ms delay between each line
  };

  const addLinesOneByOne = (lines: string[]) => {
    lineQueue = lineQueue.concat(lines);
    if (!isProcessing) {
      processQueue();
    }
  };

  useEffect(() => {
    term = new Terminal({
      smoothScrollDuration: 200, // Set smooth scroll duration to 200ms
    });
    term.loadAddon(fitAddon);

    if (terminalRef.current) term.open(terminalRef.current);
    fitAddon.fit();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    term?.writeln(initialMessage);

    const eventSource = new EventSource(logEndpoint);
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
      if (terminalRef.current) {
        resizeObserver.unobserve(terminalRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [logEndpoint]);

  return (
    <Sheet
      sx={{
        overflow: 'auto',
        backgroundColor: '#000',
        color: '#aaa',
        height: '100%',
      }}
      ref={terminalRef}
    ></Sheet>
  );
};

export default OutputTerminal;
