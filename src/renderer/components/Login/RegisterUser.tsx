import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  Input,
  Stack,
  Typography,
} from '@mui/joy';
import { getPath } from 'renderer/lib/api-client/urls';
import { FcGoogle } from 'react-icons/fc';
import { FaGithub } from 'react-icons/fa6';
import { useAuth } from '../../lib/authContext';

export default function RegisterForm({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // State for flow control
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loadingState, setLoadingState] = useState<string | null>(null);

  // OAuth Availability State
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [githubOAuthEnabled, setGithubOAuthEnabled] = useState(false);

  useEffect(() => {
    const checkOAuthStatus = async () => {
      const apiUrl = (window as any).TransformerLab?.API_URL;
      if (!apiUrl) return;

      try {
        const response = await fetch(`${apiUrl}auth/google/status`);
        if (response.ok) {
          const data = await response.json();
          setGoogleOAuthEnabled(data.enabled);
        }
      } catch (err) {
        console.warn('Failed to check Google OAuth status:', err);
      }

      try {
        const response = await fetch(`${apiUrl}auth/github/status`);
        if (response.ok) {
          const data = await response.json();
          setGithubOAuthEnabled(data.enabled);
        }
      } catch (err) {
        console.warn('Failed to check GitHub OAuth status:', err);
      }
    };

    checkOAuthStatus();

    const interval = setInterval(() => {
      if ((window as any).TransformerLab?.API_URL) {
        checkOAuthStatus();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    const apiUrl = (window as any).TransformerLab?.API_URL;
    if (!apiUrl) return;

    try {
      setLoadingState(provider);
      const response = await fetch(`${apiUrl}auth/${provider}/authorize`);
      const data = await response.json();

      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        setLoadingState(null);
      }
    } catch (error) {
      console.error(`Error during ${provider} login:`, error);
      setLoadingState(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingState('email');

    try {
      await fetchWithAuth(getPath('auth', ['register'], {}), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          confirm_password: confirmPassword,
          first_name: firstName,
          last_name: lastName,
        }),
      });
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error during registration:', error);
    } finally {
      setLoadingState(null);
    }
  };

  if (showConfirmation) {
    return (
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Confirmation Sent!
        </Typography>
        <Typography level="body-md">
          Please check your email to validate your account before logging in.
        </Typography>
        <Button
          onClick={onClose}
          color="primary"
          variant="solid"
          sx={{ mt: 3 }}
        >
          Close
        </Button>
      </Box>
    );
  }

  const showDivider = googleOAuthEnabled || githubOAuthEnabled;

  return (
    <Stack spacing={2} sx={{ textAlign: 'center' }}>
      {(googleOAuthEnabled || githubOAuthEnabled) && (
        <Stack spacing={1.5}>
          {googleOAuthEnabled && (
            <Button
              variant="outlined"
              color="neutral"
              fullWidth
              startDecorator={<FcGoogle size={22} />}
              onClick={() => handleOAuthLogin('google')}
              loading={loadingState === 'google'}
              disabled={loadingState !== null && loadingState !== 'google'}
              sx={{
                borderColor: 'neutral.300',
                '&:hover': { bg: 'neutral.100' },
              }}
            >
              Register with Google
            </Button>
          )}

          {githubOAuthEnabled && (
            <Button
              variant="outlined"
              color="neutral"
              fullWidth
              startDecorator={<FaGithub size={22} color="black" />}
              onClick={() => handleOAuthLogin('github')}
              loading={loadingState === 'github'}
              disabled={loadingState !== null && loadingState !== 'github'}
              sx={{
                borderColor: 'neutral.300',
                '&:hover': { bg: 'neutral.100' },
              }}
            >
              Register with GitHub
            </Button>
          )}
        </Stack>
      )}

      {showDivider && (
        <Divider sx={{ my: 1, color: 'neutral.500', fontSize: 'sm' }}>
          Or register with email
        </Divider>
      )}

      <form onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <FormControl sx={{ flex: 1, minWidth: 0 }}>
              <Input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                disabled={loadingState !== null}
              />
            </FormControl>
            <FormControl sx={{ flex: 1, minWidth: 0 }}>
              <Input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loadingState !== null}
              />
            </FormControl>
          </Stack>

          <FormControl required>
            <Input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loadingState !== null}
            />
          </FormControl>

          <FormControl required>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loadingState !== null}
            />
          </FormControl>

          <FormControl required>
            <Input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loadingState !== null}
            />
          </FormControl>

          <Button
            type="submit"
            variant="solid"
            color="primary"
            sx={{ mt: 2 }}
            loading={loadingState === 'email'}
            disabled={loadingState !== null && loadingState !== 'email'}
          >
            Sign Up
          </Button>

          <Button
            type="button"
            onClick={onClose}
            color="danger"
            variant="plain"
            disabled={loadingState !== null}
          >
            Cancel
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
