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
  lineAnimationDelay = 10,
  initialMessage = '',
}) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddon = useRef(new FitAddon());
  const lineQueue = useRef<string[]>([]);
  const isProcessing = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleResize = debounce(() => {
    if (termRef.current) {
      fitAddon.current.fit();
    }
  }, 300);

  const processQueue = () => {
    if (!termRef.current) return;
    if (lineQueue.current.length === 0) {
      isProcessing.current = false;
      return;
    }

    isProcessing.current = true;
    const line = lineQueue.current.shift()!;
    termRef.current.write(line.replace(/\n$/, '\r\n'));
    if (terminalRef.current) {
      terminalRef.current.scrollIntoView({ behavior: 'smooth' });
    }

    timeoutRef.current = setTimeout(() => {
      processQueue();
    }, lineAnimationDelay);
  };

  const addLinesOneByOne = (lines: string[]) => {
    lineQueue.current = lineQueue.current.concat(lines);
    if (!isProcessing.current) {
      processQueue();
    }
  };

  useEffect(() => {
    termRef.current = new Terminal({
      smoothScrollDuration: 200,
    });
    termRef.current.loadAddon(fitAddon.current);

    if (terminalRef.current) termRef.current.open(terminalRef.current);
    fitAddon.current.fit();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    termRef.current.writeln(initialMessage);

    const eventSource = new EventSource(logEndpoint);
    eventSource.onmessage = (event) => {
      if (termRef.current) {
        const lines = JSON.parse(event.data);
        addLinesOneByOne(lines);
      }
    };
    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
    };

    return () => {
      eventSource.close();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      termRef.current?.dispose();
      termRef.current = null;
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
    >
      &nbsp;
    </Sheet>
  );
};

export default OutputTerminal;
