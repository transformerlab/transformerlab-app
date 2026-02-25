import React, { useState, useEffect } from 'react';
import {
  Button,
  Divider,
  FormControl,
  Input,
  Stack,
  Typography,
  Box,
} from '@mui/joy';
import { FcGoogle, FaGithub } from 'renderer/components/Icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import { useNotification } from '../Shared/NotificationSystem';
import { API_URL } from '../../lib/api-client/urls';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [githubOAuthEnabled, setGithubOAuthEnabled] = useState(false);
  const [oidcProviders, setOidcProviders] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const { login } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  // Auto-login for single user mode
  useEffect(() => {
    const autoLogin = async () => {
      // Only attempt auto-login if we have a valid API URL (connection is established)
      const apiUrl = API_URL();
      if (!apiUrl) {
        console.log('Skipping auto-login: no API URL available.');
        return;
      }

      // Only auto-login if MULTIUSER is not enabled
      // Check window.platform first (cloud mode), then fallback to process.env
      const isMultiUserMode =
        (window as any).platform?.multiuser === true ||
        (typeof process !== 'undefined' &&
          process.env &&
          process.env.MULTIUSER === 'true');
      if (isMultiUserMode) {
        return;
      }

      try {
        console.log('Attempting auto-login for single user mode');
        await login('admin@example.com', 'admin123');
      } catch (error) {
        console.error('Auto-login failed:', error);
      }
    };

    autoLogin();
  }, [login]);

  // Check OAuth status on component mount
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

      try {
        const response = await fetch(`${apiUrl}auth/oidc/providers`);
        if (response.ok) {
          const data = await response.json();
          if (data.enabled && Array.isArray(data.providers)) {
            setOidcProviders(data.providers);
          }
        }
      } catch (err) {
        console.warn('Failed to check OIDC providers:', err);
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

  const handleOAuthLogin = async (provider: string) => {
    const apiUrl = (window as any).TransformerLab?.API_URL;
    if (!apiUrl) {
      setError(`Unable to initialize login. Please try again.`);
      return;
    }

    try {
      setLoadingState(provider);
      setError('');

      const response = await fetch(`${apiUrl}auth/${provider}/authorize`);
      const data = await response.json();

      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        setError(`Failed to initialize ${provider} login.`);
        setLoadingState(null);
      }
    } catch (err) {
      console.error(`${provider} OAuth error:`, err);
      setError(`Failed to connect to ${provider}. Please try again.`);
      setLoadingState(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoadingState('email');

    try {
      const result = await login(email, password);
      if (result instanceof Error) {
        if (result.info?.detail === 'LOGIN_USER_NOT_VERIFIED') {
          setError(
            'Email not verified. Please check your email for the verification link.',
          );
          return;
        }
        setError(
          result.info?.message ??
            'Login failed. Please check your credentials.',
        );
      } else {
        if (password === 'admin123') {
          addNotification({
            type: 'danger',
            message:
              'You are using a default insecure password. Please change it in User Settings.',
          });
        }
      }
    } catch (err) {
      setError('Login failed. Please check your credentials.');
    } finally {
      setLoadingState(null);
    }
  };

  let emailAuthEnabled = true;
  try {
    emailAuthEnabled = process.env.EMAIL_AUTH_ENABLED === 'true';
  } catch {
    emailAuthEnabled = true;
  }

  const showDivider =
    (googleOAuthEnabled || githubOAuthEnabled || oidcProviders.length > 0) &&
    emailAuthEnabled;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: '400px', // Optional: keeps it from getting too wide on large screens
        margin: '0 auto', // Helps center this component in its parent
      }}
    >
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <Stack spacing={2} sx={{ width: '100%' }}>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
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
                  // Slight bump in border boldness for better definition
                  borderColor: 'neutral.300',
                  '&:hover': { bg: 'neutral.100', borderColor: 'neutral.400' },
                }}
              >
                Continue with Google
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
                  '&:hover': { bg: 'neutral.100', borderColor: 'neutral.400' },
                }}
              >
                Continue with GitHub
              </Button>
            )}

            {oidcProviders.map((p) => (
              <Button
                key={p.id}
                variant="outlined"
                color="neutral"
                fullWidth
                onClick={() => handleOAuthLogin(p.id)}
                loading={loadingState === p.id}
                disabled={loadingState !== null && loadingState !== p.id}
                sx={{
                  borderColor: 'neutral.300',
                  '&:hover': { bg: 'neutral.100', borderColor: 'neutral.400' },
                }}
              >
                Continue with {p.name}
              </Button>
            ))}
          </Stack>

          {showDivider && (
            <Divider sx={{ my: 1, color: 'neutral.500', fontSize: 'sm' }}>
              Or sign in with email
            </Divider>
          )}

          {emailAuthEnabled && (
            <>
              <FormControl required>
                <Input
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  disabled={loadingState !== null}
                  variant="outlined"
                />
              </FormControl>
              <FormControl required>
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loadingState !== null}
                  variant="outlined"
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
                loading={loadingState === 'email'}
                disabled={loadingState !== null && loadingState !== 'email'}
                sx={{ mt: 1 }}
              >
                Sign In
              </Button>

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mt: 1,
                  px: 0.5,
                }}
              >
                <Typography
                  level="body-sm"
                  color="primary"
                  onClick={() => navigate('/register')}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  Create account
                </Typography>
                <Typography
                  level="body-sm"
                  color="neutral"
                  onClick={() => navigate('/forgot-password')}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  Forgot Password?
                </Typography>
              </Box>
            </>
          )}
        </Stack>
      </form>
    </Box>
  );
}
