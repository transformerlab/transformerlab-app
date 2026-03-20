import React, { useState } from 'react';
import { Box, Button, FormControl, Input, Stack, Typography } from '@mui/joy';
import { API_URL } from '../../lib/api-client/urls';
import { useAuth } from '../../lib/authContext';

export default function FirstUserSetupForm() {
  const { login } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const apiUrl = API_URL();
    if (!apiUrl) {
      setError('Unable to initialize login. Please try again.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}auth/setup/create-first-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          confirm_password: confirmPassword,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
        }),
      });

      if (!res.ok) {
        let detail: any = null;
        try {
          const data = await res.json();
          detail = data?.detail;
        } catch {
          // ignore
        }
        const msg =
          typeof detail === 'string'
            ? detail
            : (detail?.reason ??
              detail?.message ??
              `Setup failed with HTTP ${res.status}`);
        setError(msg);
        return;
      }

      const loginResult = await login(email, password);
      if (loginResult instanceof Error) {
        setError(
          loginResult.info?.message ??
            loginResult.message ??
            'Login failed after setup. Please try again.',
        );
      }
    } catch (err) {
      setError(
        'Unable to connect to the server. Please check that the server is running and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography level="h4" component="div" sx={{ mb: 2 }}>
        Create your first admin user
      </Typography>

      <Typography level="body-sm" sx={{ mb: 2, color: 'neutral.600' }}>
        This is a one-time setup for fresh installs. You can sign in immediately
        after creating the first user.
      </Typography>

      <form onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <FormControl sx={{ flex: 1, minWidth: 0 }}>
              <Input
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
            </FormControl>
            <FormControl sx={{ flex: 1, minWidth: 0 }}>
              <Input
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
              />
            </FormControl>
          </Stack>

          <FormControl required>
            <Input
              placeholder="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              disabled={loading}
            />
          </FormControl>

          <FormControl required>
            <Input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </FormControl>

          <FormControl required>
            <Input
              placeholder="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </FormControl>

          {error && (
            <Typography
              level="body-sm"
              color="danger"
              sx={{ textAlign: 'center' }}
            >
              {error}
            </Typography>
          )}

          <Button
            type="submit"
            fullWidth
            variant="solid"
            color="primary"
            loading={loading}
            disabled={
              loading ||
              email.trim() === '' ||
              password.trim() === '' ||
              confirmPassword.trim() === ''
            }
          >
            Create First User
          </Button>
        </Stack>
      </form>
    </Box>
  );
}
