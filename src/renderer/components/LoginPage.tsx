import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from '../lib/authContext';
import HexLogo from './Shared/HexLogo';

import labImage from './Welcome/img/lab.jpg';

function ForgotPasswordForm({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useAuth();

  // Add local state for the forgot password form
  const [email, setEmail] = useState('');

  // Handler to call fake HTTP endpoint and show feedback
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Call the fake endpoint using fetchWithAuth
    try {
      await fetchWithAuth(getAPIFullPath('auth', ['forgotPassword'], {}), {
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
          Send Reset Instructions
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
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);

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
          {forgotPasswordMode ? (
            <ForgotPasswordForm onClose={() => setForgotPasswordMode(false)} />
          ) : (
            <form onSubmit={handleSubmit}>
              <Stack spacing={2}>
                <FormControl required>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </FormControl>

                <FormControl required>
                  <FormLabel>Password</FormLabel>
                  <Input
                    type="password"
                    placeholder="Enter your password"
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
                  variant="plain"
                  size="sm"
                  color="danger"
                  onClick={() => setForgotPasswordMode(true)}
                >
                  Forgot My Password
                </Button>

                <Button
                  type="submit"
                  fullWidth
                  loading={isLoading}
                  sx={{ mt: 1 }}
                >
                  Sign In
                </Button>
              </Stack>
            </form>
          )}
        </ModalDialog>
      </Modal>
    </Box>
  );
}
