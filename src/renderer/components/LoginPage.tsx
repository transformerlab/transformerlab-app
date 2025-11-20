import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { getPath, getAPIFullPath } from 'renderer/lib/api-client/urls';
import { FaDiscord, FaGoogle } from 'react-icons/fa6';
import { useAuth } from '../lib/authContext';
import HexLogo from './Shared/HexLogo';

import labImage from './Welcome/img/lab.jpg';

function RegisterForm({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Handler to call fake HTTP endpoint and show feedback
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Call the fake endpoint using fetchWithAuth
    try {
      await fetchWithAuth(getPath('auth', ['register'], {}), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, confirmPassword }),
      });
    } catch (error) {
      console.error('Error during registration:', error);
    }
    // For now, just close the form after submission
    setShowConfirmation(true);
  };

  if (showConfirmation) {
    return (
      <Box>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Confirmation Sent!
        </Typography>
        <Typography>
          Please check your email to validate your email address before logging
          in.
        </Typography>
        <Button
          type="button"
          onClick={onClose}
          color="primary"
          variant="solid"
          sx={{ mt: 2 }}
        >
          Close
        </Button>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Button startDecorator={<FaGoogle />}>Register with Google</Button>
      <Button startDecorator={<FaDiscord />}>Register with Discord</Button>
      <Typography level="body-md" component="div" sx={{ pt: 3 }}>
        Or Register Using Email:
      </Typography>
      <form
        onSubmit={(e) => {
          handleSubmit(e);
        }}
      >
        <Stack direction="row" spacing={2} sx={{ mt: 0 }}>
          <Input
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoFocus
            sx={{ flex: 1 }}
          />
          <Input
            type="text"
            placeholder="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            sx={{ flex: 1 }}
          />
        </Stack>
        <FormControl required sx={{ mt: 3 }}>
          <Input
            type="email"
            placeholder="Email Address"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormControl>
        <FormControl required sx={{ mt: 3 }}>
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormControl>
        <FormControl required sx={{ mt: 1 }}>
          <Input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </FormControl>
        <Button
          // switched to submit so the form's onSubmit is used
          type="submit"
          variant="solid"
          sx={{ mt: 4 }}
        >
          Sign Up
        </Button>{' '}
        <Button type="button" onClick={onClose} color="danger" variant="plain">
          Cancel
        </Button>
      </form>
    </Stack>
  );
}

function ForgotPasswordForm({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useAuth();

  // Add local state for the forgot password form
  const [email, setEmail] = useState('');

  // Handler to call fake HTTP endpoint and show feedback
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Call the fake endpoint using fetchWithAuth
    try {
      await fetchWithAuth(getPath('auth', ['forgotPassword'], {}), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
    } catch (error) {
      console.error('Error sending reset instructions:', error);
    }
    // For now, just close the form after submission
    onClose();
  };

  return (
    <Box>
      <Typography level="h4" component="div" sx={{ mb: 2 }}>
        Forgot Password
      </Typography>

      <form
        onSubmit={(e) => {
          handleSubmit(e);
        }}
      >
        <FormControl required>
          <FormLabel>Email</FormLabel>
          <Input
            type="email"
            placeholder="Enter your email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormControl>
        <Button
          // switched to submit so the form's onSubmit is used
          type="submit"
          variant="solid"
          sx={{ mt: 3 }}
        >
          Reset Password
        </Button>{' '}
        <Button type="button" onClick={onClose} color="danger" variant="plain">
          Cancel
        </Button>
      </form>
    </Box>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [mode, setMode] = useState<'login' | 'register' | 'forgotPassword'>(
    'login',
  );

  const { login, fetchWithAuth } = useAuth();

  // Check for verification token on mount
  useEffect(() => {
    // Parse query params from hash URL (format: #/?token=...)
    const hash = window.location.hash;
    const hashWithoutSymbol = hash.substring(1);
    const queryIndex = hashWithoutSymbol.indexOf('?');
    const queryString = queryIndex !== -1 ? hashWithoutSymbol.substring(queryIndex + 1) : '';
    const params = new URLSearchParams(queryString);
    const token = params.get('token');
    
    if (token) {
      const verifyEmail = async () => {
        setIsLoading(true);
        try {
          const response = await fetch(getAPIFullPath('auth', ['verify'], {}), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
          });

          if (response.ok) {
            setVerifySuccess(true);
            setError('');
            window.location.hash = window.location.hash.split('?')[0];
          } else {
            const data = await response.json();
            setError(data.detail || 'Verification failed. Please try again.');
          }
        } catch (err) {
          setError('Verification failed. Please try again.');
        } finally {
          setIsLoading(false);
        }
      };
      
      verifyEmail();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Call the login method from auth context
      const result = await login(email, password);
      if (result instanceof Error) {
        setError(
          result.info?.message ??
            'Login failed. Please check your credentials.',
        );
      }
    } catch (err) {
      setError('Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundImage: `url(${labImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <Modal
        open
        onClose={() => {}}
        sx={{
          '& .MuiModal-backdrop': {
            backdropFilter: 'blur(0px)',
          },
        }}
      >
        <ModalDialog
          sx={{
            width: 400,
            borderRadius: 'md',
            p: 3,
            boxShadow: 'lg',
            overflow: 'auto',
          }}
        >
          <HexLogo width={32} height={32} />
          <Typography level="h2" component="div" sx={{ mb: 1 }}>
            Transformer Lab
          </Typography>
          {mode === 'forgotPassword' && (
            <ForgotPasswordForm onClose={() => setMode('login')} />
          )}
          {mode === 'login' && (
            <form onSubmit={handleSubmit}>
              <Stack spacing={2}>
                <Button
                  startDecorator={<FaGoogle />}
                  onClick={() => {
                    alert('Not Yet Implemented');
                  }}
                >
                  Continue with Google
                </Button>
                <Button
                  startDecorator={<FaDiscord />}
                  onClick={() => {
                    alert('Not Yet Implemented');
                  }}
                >
                  Continue with Discord
                </Button>
                <Divider />
                <FormControl required>
                  <Input
                    type="email"
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </FormControl>
                <FormControl required>
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </FormControl>
                {verifySuccess && (
                  <Typography level="body-sm" color="success">
                    ✅ Email verified successfully! You can now log in.
                  </Typography>
                )}
                {error && (
                  <Typography level="body-sm" color="danger">
                    {error}
                  </Typography>
                )}
                <Button
                  type="submit"
                  fullWidth
                  loading={isLoading}
                  sx={{ mt: 1 }}
                  // endDecorator={<LogInIcon />}
                >
                  Sign In With Email
                </Button>
                <Typography
                  color="warning"
                  onClick={() => setMode('forgotPassword')}
                  sx={{ cursor: 'pointer', textAlign: 'right' }}
                >
                  Forgot Your Password?
                </Typography>
                <Typography
                  color="primary"
                  onClick={() => setMode('register')}
                  sx={{ cursor: 'pointer', textAlign: 'center' }}
                >
                  Don&apos;t have an account? <b>Sign up here.</b>
                </Typography>
              </Stack>
            </form>
          )}
          {mode === 'register' && (
            <RegisterForm onClose={() => setMode('login')} />
          )}
        </ModalDialog>
      </Modal>
    </Box>
  );
}
