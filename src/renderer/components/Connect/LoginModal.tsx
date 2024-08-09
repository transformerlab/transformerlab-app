/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import {
  Alert,
  Checkbox,
  CircularProgress,
  Divider,
  FormHelperText,
  Link,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@mui/joy';

import { apiHealthz } from '../../lib/transformerlab-api-sdk';
import { useState } from 'react';
import LocalConnection from './LocalConnection';
import OneTimePopup from '../Shared/OneTimePopup';

import MuxPlayer from '@mux/mux-player-react';

export default function LoginModal({
  setServer,
  connection,
  setTerminalDrawerOpen,
  setSSHConnection,
}) {
  const [checking, setChecking] = React.useState<boolean>(false);
  const [failed, setFailed] = React.useState<boolean>(false);
  const [recentConnections, setRecentConnections] = React.useState<string[]>(
    []
  );
  const [recentSSHConnections, setRecentSSHConnections] = React.useState<
    string[]
  >([]);

  const [host, setHost] = useState('');

  React.useEffect(() => {
    window.storage
      .get('recentConnections')
      .then((result) => {
        if (Array.isArray(result)) {
          setRecentConnections(result);
        }

        return result;
      })
      .catch(() => {});

    window.storage
      .get('recentSSHConnections')
      .then((result) => {
        if (Array.isArray(result)) {
          setRecentSSHConnections(result);
        }

        return result;
      })
      .catch(() => {});
  }, [connection]);

  async function checkServer() {
    setChecking(true);
    const response = await apiHealthz();
    const apiStatus = response !== null ? 1 : 0;
    setChecking(false);
    if (apiStatus === 1) {
      if (!recentConnections.includes(window.TransformerLab.API_URL)) {
        if (recentConnections.length > 4) {
          recentConnections.pop();
        }
        window.storage.set('recentConnections', [
          window.TransformerLab.API_URL,
          ...recentConnections,
        ]);
      }
      setServer(window.TransformerLab.API_URL);
    } else {
      setFailed(true);
    }
  }

  return (
    <Modal open={connection == ''} keepMounted>
      <ModalDialog
        aria-labelledby="basic-modal-dialog-title"
        aria-describedby="basic-modal-dialog-description"
        sx={{
          top: '5vh', // Sit 20% from the top of the screen
          margin: 'auto',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          width: '55vw',
          maxWidth: '700px',
          height: '90vh',
        }}
      >
        <OneTimePopup title="💡 Welcome To Transformer Lab">
          <>
            <p>
              To start using Transformer Lab, you can either install the
              Transformer Lab engine on your local machine or connect to a
              remote computer where the engine is already running.
            </p>
            <MuxPlayer
              streamType="on-demand"
              playbackId="2EK002M4GdFF32RCeOVIqEhas02GfUmu01UCSjuxqwRmcI"
              primaryColor="#FFFFFF"
              secondaryColor="#000000"
              style={{ maxWidth: '300px', alignSelf: 'center' }}
              autoPlay
              loop
              muted
            />
            <p>
              Installing the engine takes time (often about 15 minutes) but by
              the end of the process, you will have all the components of a
              powerful LLM workstation on your machine.
            </p>
          </>
        </OneTimePopup>
        <Tabs
          aria-label="Basic tabs"
          defaultValue={0}
          sx={{ overflow: 'hidden' }}
          onChange={(_event, newValue) => {}}
        >
          <TabList tabFlex={1}>
            <Tab>Local Engine</Tab>
            <Tab>Connect to Remote Engine</Tab>
            {/* <Tab value="SSH">Connect via SSH</Tab> */}
          </TabList>
          <TabPanel
            value={0}
            sx={{
              p: 1,
              overflowY: 'hidden',
              height: '100%',
            }}
            keepMounted
          >
            <LocalConnection setServer={setServer} />
          </TabPanel>
          <TabPanel value={1} sx={{ p: 1 }} keepMounted>
            {/* <Typography id="basic-modal-dialog-title" component="h2">
              Connect to Server
            </Typography> */}
            {/* <Typography
          id="basic-modal-dialog-description"
          textColor="text.tertiary"
        >
          Provide connection information:
        </Typography> */}
            <Alert variant="plain">
              <Typography
                level="body-sm"
                textColor="text.tertiary"
                fontWeight={400}
              >
                <a
                  href="https://transformerlab.ai/docs/advanced-install#manual-install-instructions"
                  target="_blank"
                >
                  Follow these instructions
                </a>{' '}
                to install the Transformer Lab Engine on a remote computer. Once
                you have completed those steps, enter the server URL and port
                below.
              </Typography>
            </Alert>
            <form
              onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
                event.preventDefault();

                const server = event.currentTarget.elements[0].value
                  .trim()
                  .replace(/\/+$/, '');
                const port = event.currentTarget.elements[1].value.replace(
                  /[\s]+/g,
                  ''
                );

                // eslint-disable-next-line prefer-template
                const fullServer = 'http://' + server + ':' + port + '/';

                window.TransformerLab = {};
                window.TransformerLab.API_URL = fullServer;

                checkServer();
              }}
            >
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Server URL</FormLabel>
                  <Input autoFocus required placeholder="192.168.1.100" />
                  <FormHelperText>
                    Do not include http:// in the URL.
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>Server Port</FormLabel>
                  <Input required defaultValue="8000" placeholder="8000" />
                </FormControl>
                <Button
                  type="submit"
                  startDecorator={
                    checking && (
                      <CircularProgress
                        variant="solid"
                        thickness={2}
                        sx={{
                          '--CircularProgress-size': '16px',
                          color: 'white',
                        }}
                      />
                    )
                  }
                  sx={{ p: 1 }}
                >
                  Submit
                </Button>
                {failed && (
                  <div style={{ color: 'var(--joy-palette-danger-600)' }}>
                    Couldn&apos;t connect to server. Please try a different URL.
                  </div>
                )}
                <Divider />
                <div>
                  <Typography>
                    <b>Recent Connections:</b>{' '}
                    <Button
                      size="sm"
                      variant="plain"
                      color="neutral"
                      sx={{ fontWeight: 'normal' }}
                      onClick={() => {
                        window.storage.set('recentConnections', []);
                        setRecentConnections([]);
                      }}
                    >
                      clear
                    </Button>
                  </Typography>
                  {recentConnections.length > 0 &&
                    recentConnections.map((connection, index) => (
                      <Typography
                        sx={{ color: 'neutral.400', mt: '0px!' }}
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                      >
                        <Link
                          onClick={() => {
                            window.TransformerLab = {};
                            window.TransformerLab.API_URL = connection;
                            checkServer();
                          }}
                        >
                          {connection}
                        </Link>
                      </Typography>
                    ))}
                </div>
              </Stack>
            </form>
          </TabPanel>

          <TabPanel value="SSH" sx={{ height: '100%', overflow: 'auto' }}>
            <form
              id="ssh-form"
              onSubmit={(event) => {
                event.preventDefault();

                const formData = new FormData(event.currentTarget);

                const host = formData.get('host')?.toString();
                const username = formData.get('username')?.toString();
                const password = formData.get('userpassword')?.toString();
                const sshkeylocation = formData
                  .get('sshkeylocation')
                  ?.toString();
                const update_and_install =
                  window.document.getElementsByName('update_and_install')[0]
                    ?.checked;
                const create_reverse_tunnel = window.document.getElementsByName(
                  'create_reverse_tunnel'
                )[0]?.checked;
                const run_permanent =
                  window.document.getElementsByName('run_permanent')[0]
                    ?.checked;

                setSSHConnection({
                  host: host,
                  username: username,
                  password: password,
                  sshkeylocation: sshkeylocation,
                  update_and_install: update_and_install,
                  create_reverse_tunnel: create_reverse_tunnel,
                  run_permanent: run_permanent,
                });

                setTerminalDrawerOpen(true);

                const fullServer = 'http://' + host + ':' + '8000' + '/';

                window.TransformerLab = {};
                window.TransformerLab.API_URL = fullServer;

                setServer(fullServer);
              }}
            >
              <Stack sx={{}} spacing={2}>
                <FormControl>
                  <FormLabel>SSH Host:</FormLabel>
                  <Input
                    name="host"
                    autoFocus
                    required
                    placeholder="192.168.1.100"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Username:</FormLabel>
                  <Input name="username" required placeholder="username" />
                </FormControl>
                <FormControl>
                  <FormLabel>Password:</FormLabel>
                  <Input
                    name="userpassword"
                    type="password"
                    placeholder="password"
                  />
                  <FormHelperText>
                    Leave blank to use SSH key auth
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>SSH Key:</FormLabel>
                  <Input
                    name="sshkeylocation"
                    placeholder="/Users/name/.ssh/id_rsa"
                  />
                  <FormHelperText>
                    Enter a full path (no ~), or leave blank to use the default
                    which is HOME_DIR/.ssh/id_rsa
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <Checkbox
                    name="update_and_install"
                    label="Try to update"
                    defaultChecked
                  />
                  <FormHelperText>
                    If unchecked, launches the API server, but avoids fetching
                    and installing, if any version exists.
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <Checkbox
                    name="create_reverse_tunnel"
                    label="Create reverse tunnel on port 8000"
                    defaultChecked
                  />
                  <FormHelperText>
                    This will create a reverse tunnel connecting localhost:8000
                    → remote_host:8000, creating a secure connection to the API
                    without opening additional ports.
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <Checkbox
                    name="run_permanent"
                    label="Keep running in background"
                    defaultChecked
                  />
                  <FormHelperText>
                    Keep the API server running even if the SSH connection is
                    lost. Uses the <b>nohup</b> command
                  </FormHelperText>
                </FormControl>
                <Button type="submit">Connect</Button>
                <Divider />
                <div>
                  <Typography>
                    <b>Recent SSH Connections:</b>{' '}
                    <Button
                      size="sm"
                      variant="plain"
                      color="neutral"
                      sx={{ fontWeight: 'normal' }}
                      onClick={() => {
                        window.storage.set('recentSSHConnections', []);
                        setRecentSSHConnections([]);
                      }}
                    >
                      clear
                    </Button>
                  </Typography>
                  {recentSSHConnections.length > 0 &&
                    recentSSHConnections.map((connection, index) => (
                      <Typography
                        sx={{ color: 'neutral.400', mt: '0px!' }}
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                      >
                        <Link
                          onClick={() => {
                            setSSHConnection({
                              host: connection.host,
                              username: connection.username,
                              password: null,
                              sshkeylocation: connection.sshkeylocation,
                              update_and_install: connection.update_and_install,
                              create_reverse_tunnel:
                                connection.create_reverse_tunnel,
                              run_permanent: connection.run_permanent,
                              tryKeyboard: true,
                            });

                            setTerminalDrawerOpen(true);

                            const fullServer =
                              'http://' + connection.host + ':' + '8000' + '/';

                            window.TransformerLab = {};
                            window.TransformerLab.API_URL = fullServer;

                            setServer(fullServer);
                          }}
                        >
                          {connection.username}@{connection.host} [
                          {connection.sshkeylocation
                            ? 'key: ' + connection.sshkeylocation
                            : 'password'}
                          {connection.update_and_install ? (
                            ' - ✔️ update'
                          ) : (
                            <>
                              - <s>update</s>
                            </>
                          )}
                          {connection.create_reverse_tunnel ? (
                            ' - ✔️ reverse tunnel'
                          ) : (
                            <>
                              - <s>reverse tunnel</s>
                            </>
                          )}
                          {connection.run_permanent ? (
                            ' - ✔️ nohup'
                          ) : (
                            <>
                              - <s>nohup</s>
                            </>
                          )}
                          ]
                        </Link>
                      </Typography>
                    ))}
                </div>
              </Stack>
            </form>
          </TabPanel>
        </Tabs>
      </ModalDialog>
    </Modal>
  );
}
