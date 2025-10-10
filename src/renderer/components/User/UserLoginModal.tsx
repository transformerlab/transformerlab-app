import { useState } from 'react';

import {
  Alert,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from '@mui/joy';

import { TriangleAlert, EyeIcon, EyeOffIcon } from 'lucide-react';

import { login, registerUser } from 'renderer/lib/transformerlab-api-sdk';
import { API_URL } from 'renderer/lib/transformerlab-api-sdk';
import { DEFAULT_API_FALLBACK } from './authCallbackUtils';

export default function UserLoginModal({ open, onClose }) {
  const [loginErrorMessage, setLoginErrorMessage] = useState<string | null>(
    null,
  );
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const commonTabPanelSx = {
    p: 1,
    pt: 4,
    width: '100%',
    maxWidth: '400px',
    mx: 'auto',
  };

  const descriptionAlertSx = {
    display: 'flex',
    justifyContent: 'center',
    mb: 2,
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setLoginErrorMessage(null);
        onClose();
      }}
    >
      <ModalDialog
        sx={{
          top: '5vh',
          margin: 'auto',
          transform: 'translateX(-50%)',
          width: '80vw',
          maxWidth: '600px',
          height: '90vh',
        }}
      >
        <Tabs defaultValue="login">
          <TabList tabFlex={1}>
            <Tab value="login">Login</Tab>
            <Tab value="register">Register New User</Tab>
          </TabList>

          <TabPanel value="login" sx={commonTabPanelSx}>
            {loginErrorMessage ? (
              <Alert variant="outlined" color="warning" sx={descriptionAlertSx}>
                <TriangleAlert />
                <Typography level="body-sm" textColor="text.tertiary">
                  {loginErrorMessage}
                </Typography>
              </Alert>
            ) : (
              <Alert variant="plain" sx={descriptionAlertSx}>
                <Typography level="body-sm" textColor="text.tertiary">
                  Login with your existing account credentials.
                </Typography>
              </Alert>
            )}
            <form
              onSubmit={async (event) => {
                event.preventDefault();

                // Read login data from the form and submit
                const formData = new FormData(event.currentTarget);
                const username = formData.get('email') as string;
                const password = formData.get('password') as string;
                const result = await login(username, password);

                // Check if login was successful. If not, stay on screen
                if (result?.status === 'success') {
                  console.log(`Login attempt successful for user ${username}`);
                  setLoginErrorMessage(null);
                  onClose();
                } else if (result?.status === 'error') {
                  setLoginErrorMessage(result?.message);
                } else {
                  // unauthorized - reset fields
                  (event.target as HTMLFormElement).reset();
                  setLoginErrorMessage(result?.message);
                }
              }}
            >
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    name="email"
                    type="email"
                    autoFocus
                    required
                    placeholder="user@example.com"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Password</FormLabel>
                  <Input
                    name="password"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    endDecorator={
                      <Button
                        variant="plain"
                        color="neutral"
                        onClick={() => setShowLoginPassword((v) => !v)}
                        sx={{ minWidth: 0, p: 0.5 }}
                        tabIndex={-1}
                      >
                        {showLoginPassword ? (
                          <EyeOffIcon size={20} />
                        ) : (
                          <EyeIcon size={20} />
                        )}
                      </Button>
                    }
                  />
                </FormControl>
                <Button type="submit">Login</Button>
                {window.platform?.appmode === 'cloud' && (
                  <Button
                    variant="soft"
                    onClick={async () => {
                      try {
                        const w: any = window as any;
                        const fallbackBase = DEFAULT_API_FALLBACK;
                        const apiBase =
                          (API_URL && API_URL()) ||
                          w.TransformerLab?.API_URL ||
                          fallbackBase;
                        // Add a cache-buster to avoid browsers (or proxies) returning 304 with HTML body
                        const cacheBuster = Date.now().toString();
                        const authorizeEndpoint = `${apiBase}auth/login-url?cb=${cacheBuster}`;

                        const resp = await fetch(authorizeEndpoint, {
                          method: 'GET',
                          headers: {
                            'Cache-Control':
                              'no-store, no-cache, must-revalidate',
                            Pragma: 'no-cache',
                            'X-Requested-With': 'XMLHttpRequest',
                            Accept: 'application/json, */*;q=0.8',
                          },
                        });

                        if (resp.status === 304) {
                          // Treat 304 as an error for this JSON-init endpoint; force retry logic by clearing state
                          await w.storage.delete('authWorkosState');
                          setLoginErrorMessage(
                            'Failed to initiate SSO (stale cached response). Please try again.',
                          );
                          return;
                        }

                        if (!resp.ok) {
                          await w.storage.delete('authWorkosState');
                          setLoginErrorMessage(
                            `Failed to initiate SSO (HTTP ${resp.status}).`,
                          );
                          return;
                        }

                        let data: any = null;
                        const contentType =
                          resp.headers.get('content-type') || '';
                        try {
                          if (contentType.includes('application/json')) {
                            data = await resp.json();
                          } else {
                            const text = await resp.text();
                            // If HTML came back, this is unexpected
                            if (
                              text.trim().startsWith('<!DOCTYPE') ||
                              text.trim().startsWith('<html')
                            ) {
                              throw new Error(
                                'Server returned HTML instead of JSON.',
                              );
                            }
                            // Attempt a lenient parse
                            try {
                              data = JSON.parse(text);
                            } catch {
                              data = { detail: 'Unexpected response format.' };
                            }
                          }
                        } catch (parseErr) {
                          await w.storage.delete('authWorkosState');
                          setLoginErrorMessage('SSO start failed: ' + parseErr);
                          return;
                        }
                        const redirectTo =
                          data?.login_url || data?.authorization_url;
                        if (redirectTo) {
                          try {
                            const redirectUrl = new URL(redirectTo);
                            const stateFromQuery =
                              redirectUrl.searchParams.get('state');
                            const hash = redirectUrl.hash || '';
                            const stateFromHash = hash
                              ? new URLSearchParams(
                                  hash.startsWith('#') ? hash.slice(1) : hash,
                                ).get('state')
                              : null;
                            const stateValue =
                              stateFromQuery ||
                              stateFromHash ||
                              data?.state ||
                              null;
                            if (stateValue) {
                              await w.storage.set(
                                'authWorkosState',
                                stateValue,
                              );
                            } else {
                              await w.storage.delete('authWorkosState');
                            }
                          } catch {
                            await w.storage.delete('authWorkosState');
                          }
                          window.location.href = redirectTo;
                        } else {
                          await w.storage.delete('authWorkosState');
                          setLoginErrorMessage(
                            data?.detail || 'Failed to initiate SSO.',
                          );
                        }
                      } catch (e) {
                        const w: any = window as any;
                        await w.storage.delete('authWorkosState');
                        setLoginErrorMessage('SSO start failed: ' + e);
                      }
                    }}
                  >
                    Login with WorkOS
                  </Button>
                )}
              </Stack>
            </form>
          </TabPanel>

          <TabPanel value="register" sx={commonTabPanelSx}>
            <Alert variant="plain" sx={descriptionAlertSx}>
              <Typography level="body-sm" textColor="text.tertiary">
                Create a new account to get started.
              </Typography>
            </Alert>
            <form
              onSubmit={async (event) => {
                event.preventDefault();

                // Read user data from the form and submit
                const formData = new FormData(event.currentTarget);
                const name = formData.get('name') as string;
                const email = formData.get('email') as string;
                const password = formData.get('password') as string;
                const result = await registerUser(name, email, password);

                // Check if login was successful. If not, stay on screen
                if (result?.status === 'success') {
                  alert(`Registered new user ${email}`);
                  onClose();
                } else {
                  alert(result?.message);
                }
              }}
            >
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Name</FormLabel>
                  <Input
                    name="name"
                    autoFocus
                    required
                    placeholder="Enter your name"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    name="email"
                    type="email"
                    required
                    placeholder="user@example.com"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Password</FormLabel>
                  <Input
                    name="password"
                    type={showRegisterPassword ? 'text' : 'password'}
                    required
                    placeholder="Create a password"
                    endDecorator={
                      <Button
                        variant="plain"
                        color="neutral"
                        onClick={() => setShowRegisterPassword((v) => !v)}
                        sx={{ minWidth: 0, p: 0.5 }}
                        tabIndex={-1}
                      >
                        {showRegisterPassword ? (
                          <EyeOffIcon size={20} />
                        ) : (
                          <EyeIcon size={20} />
                        )}
                      </Button>
                    }
                  />
                </FormControl>
                <Button type="submit">Register</Button>
              </Stack>
            </form>
          </TabPanel>
        </Tabs>
      </ModalDialog>
    </Modal>
  );
}
