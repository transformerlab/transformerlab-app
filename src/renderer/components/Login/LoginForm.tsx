import React, { useState, useEffect } from 'react';
import {
  Button,
  Divider,
  FormControl,
  Input,
  Stack,
  Typography,
} from '@mui/joy';
import { FaDiscord, FaGoogle } from 'react-icons/fa6';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import { useNotification } from '../Shared/NotificationSystem';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);

  const { login } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  // Check if Google OAuth is enabled on component mount
  useEffect(() => {
    const checkGoogleOAuthStatus = async () => {
      try {
        const apiUrl = (window as any).TransformerLab?.API_URL;
        if (!apiUrl) {
          console.warn('API URL not available yet, will retry...');
          setGoogleOAuthEnabled(false);
          return;
        }
        const response = await fetch(`${apiUrl}auth/google/status`);
        const data = await response.json();
        setGoogleOAuthEnabled(data.enabled);
      } catch (err) {
        console.warn('Failed to check Google OAuth status:', err);
        setGoogleOAuthEnabled(false);
      }
    };

    checkGoogleOAuthStatus();

    // Also set up an interval to check periodically in case API_URL becomes available later
    const interval = setInterval(() => {
      if ((window as any).TransformerLab?.API_URL) {
        checkGoogleOAuthStatus();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleGoogleLogin = async () => {
    // Fetch the authorization URL and redirect to Google
    const apiUrl = (window as any).TransformerLab?.API_URL;
    if (!apiUrl) {
      console.error('API URL not available for Google OAuth');
      setError('Unable to initialize Google login. Please try again.');
      return;
    }

    try {
      setIsLoading(true);
      setError(''); // Clear any previous errors

      const response = await fetch(`${apiUrl}auth/google/authorize`);
      const data = await response.json();

      // Redirect to Google's authorization URL
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        setError('Failed to initialize Google login.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Google OAuth error:', err);
      setError('Failed to connect to Google. Please try again.');
      setIsLoading(false);
    }
    // Note: We don't set isLoading to false on success because the page will redirect
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

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
      setIsLoading(false);
    }
  };

  // Check if email/password authentication is enabled
  // We do a try catch because process is not actually available, it is replaced
  // by webpack using EnvironmentPlugin at build time.
  let emailAuthEnabled = true;
  try {
    emailAuthEnabled = process.env.EMAIL_AUTH_ENABLED === 'true';
  } catch {
    emailAuthEnabled = true;
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={2}>
        {googleOAuthEnabled && (
          <Button
            startDecorator={<FaGoogle />}
            onClick={handleGoogleLogin}
            variant="solid"
            loading={isLoading}
            disabled={isLoading}
          >
            Continue with Google
          </Button>
        )}
        <Divider />
        {emailAuthEnabled && (
          <>
            <FormControl required>
              <Input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                disabled={isLoading}
              />
            </FormControl>
            <FormControl required>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </FormControl>
            {error && (
              <Typography level="body-sm" color="danger">
                {error}
              </Typography>
            )}
            <Button type="submit" fullWidth loading={isLoading} sx={{ mt: 1 }}>
              Sign In With Email
            </Button>
            <Typography
              color="warning"
              onClick={() => navigate('/forgot-password')}
              sx={{ cursor: 'pointer', textAlign: 'right' }}
            >
              Forgot Your Password?
            </Typography>
            <Typography
              color="primary"
              onClick={() => navigate('/register')}
              sx={{ cursor: 'pointer', textAlign: 'center' }}
            >
              Don&apos;t have an account? <b>Sign up here.</b>
            </Typography>{' '}
          </>
        )}
      </Stack>
    </form>
  );
}
