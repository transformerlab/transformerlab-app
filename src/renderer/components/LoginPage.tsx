import React, { useState } from 'react';
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
import { getPath } from 'renderer/lib/api-client/urls';
import { FaDiscord, FaGoogle } from 'react-icons/fa6';
import { useAuth } from '../lib/authContext';
import HexLogo from './Shared/HexLogo';

import labImage from './Welcome/img/lab.jpg';

function RegisterForm({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useAuth();

  // Add local state for the registration form
  const [email, setEmail] = useState('');
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
        <FormControl required>
          <Input
            type="email"
            placeholder="Email"
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
          sx={{ mt: 2 }}
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
          sx={{ mt: 2 }}
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
  const [mode, setMode] = useState<'login' | 'register' | 'forgotPassword'>(
    'login',
  );

  const { login } = useAuth();

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
                  color="danger"
                  onClick={() => setMode('forgotPassword')}
                  sx={{ cursor: 'pointer', textAlign: 'right' }}
                >
                  Forgot Your Password?
                </Typography>
                <Typography
                  color="success"
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
