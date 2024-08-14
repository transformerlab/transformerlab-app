import { Sheet } from '@mui/joy';
import React, { useState, useEffect } from 'react';

const BlankPage: React.FC = () => {
  useEffect(() => {
    async function fetchData() {
      await window.electron.ipcRenderer.sendMessage('serverLog:startListening');
      window.electron.ipcRenderer.removeAllListeners('serverLog:onUpdate');
      window.electron.ipcRenderer.on('serverLog:update', (data: any) => {
        // append data to the log-viewer div
        const logViewer = document.getElementById('log-viewer');
        if (logViewer) {
          logViewer.innerHTML += `${data}\n`;
        }
      });
    }
    fetchData();

    return () => {
      //send message to stop the server log listening service:
      window.electron.ipcRenderer.sendMessage('serverLog:stopListening');
      window.electron.ipcRenderer.removeAllListeners(
        'serverLog:startListening'
      );
    };
  }, []);

  return (
    <Sheet
      sx={{
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#222',
        color: 'white',
      }}
    >
      <pre id="log-viewer" style={{ whiteSpace: 'pre-wrap' }}></pre>
    </Sheet>
  );
};

export default BlankPage;
