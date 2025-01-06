import { Button, DialogTitle, Drawer, Sheet } from '@mui/joy';
import { useEffect, useRef, useState } from 'react';

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

import '@xterm/xterm/css/xterm.css';

export default function XtermJSDrawer({
  sshConnection,
  drawerOpen,
  setDrawerOpen,
}) {
  const terminalContainerRef = useRef(null);
  const termRef = useRef(null);

  useEffect(() => {
    if (sshConnection === null) {
      return;
    }

    const term = new Terminal({
      theme: {
        background: '#334155',
      },
    });

    termRef.current = term;

    const fitAddon = new FitAddon();

    window.sshClient.removeAllListeners();

    // SSH LISTENERS:
    window.sshClient.onSSHConnected((_event, value) => {
      console.log('ssh connected', value);

      // 🔐 Do not store SSH passwords in plaintext :
      let sshConnectionNoPassword = { ...sshConnection, password: '' };

      if (value === true) {
        // If we are successfully connected, store this connection in the recentSSHConnections array
        // That is part of electron storage
        window.storage.get('recentSSHConnections').then((result) => {
          if (Array.isArray(result)) {
            const recentSSHConnections = result;
            const index = recentSSHConnections.findIndex(
              (item) =>
                item.host === sshConnection.host &&
                item.username === sshConnection.username &&
                item.sshkeylocation === sshConnection.sshkeylocation
            );
            if (index > -1) {
              recentSSHConnections.splice(index, 1);
            }
            recentSSHConnections.unshift(sshConnectionNoPassword);
            window.storage
              .set('recentSSHConnections', recentSSHConnections)
              .then(() => {
                console.log('recentSSHConnections saved');
              });
          } else {
            window.storage
              .set('recentSSHConnections', [sshConnectionNoPassword])
              .then(() => {
                console.log('recentSSHConnections saved');
              });
          }
        });
      }
    });

    window.sshClient.onData((_event, data) => {
      term.write(data);
    });

    const username = sshConnection.username;
    const password = sshConnection.password;
    const host = sshConnection.host;
    const sshkeylocation = sshConnection.sshkeylocation;
    const update_and_install = sshConnection.update_and_install;
    const create_reverse_tunnel = sshConnection.create_reverse_tunnel;
    const run_permanent = sshConnection.run_permanent;
    const tryKeyboard = sshConnection.tryKeyboard;

    window.sshClient.connect({
      host: host,
      username: username,
      password: password,
      sshkeylocation: sshkeylocation,
      update_and_install: update_and_install,
      create_reverse_tunnel: create_reverse_tunnel,
      run_permanent: run_permanent,
      tryKeyboard: tryKeyboard,
    });

    // const terminalContainer =
    //   window.document.getElementById('terminal-container');

    const terminalContainer = terminalContainerRef.current;
    term.open(terminalContainer);
    term.clear();
    term.loadAddon(fitAddon);
    term.focus();
    fitAddon.fit();

    function resizeScreen() {
      fitAddon.fit();
      console.log(
        `Resize Terminal: ${JSON.stringify({
          cols: term.cols,
          rows: term.rows,
        })}`
      );
    }

    terminalContainerRef.current.addEventListener(
      'resize',
      resizeScreen,
      false
    );

    term.onData((data) => {
      // console.log('data:', data);
      window.sshClient.data(data);
    });
  }, [sshConnection]);

  return (
    <Drawer
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      anchor="bottom"
      color="primary"
      variant="solid"
      id="terminal-drawer"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
      }}
      onTransitionEnd={() => {
        if (drawerOpen) {
          // resizeScreen();
          termRef.current?.focus();
        }
      }}
    >
      <DialogTitle>Terminal</DialogTitle>
      <Sheet
        sx={{
          height: 'calc(100% - 50px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* {JSON.stringify(sshConnection)} */}
        <div
          id="terminal-container"
          className="terminal"
          ref={terminalContainerRef}
          style={{
            padding: '2px',
            backgroundColor: '#0f172a',
            overflow: 'auto',
            display: 'block',
            height: '100%',
          }}
          onClick={() => {
            termRef.current?.focus();
            console.log('click');
          }}
        ></div>
        <Button
          onClick={() => {
            termRef.current?.clear();
            termRef.current?.focus();
          }}
        >
          Clear
        </Button>
      </Sheet>
    </Drawer>
  );
}
