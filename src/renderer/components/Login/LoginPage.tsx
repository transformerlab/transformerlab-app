import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Typography,
} from '@mui/joy';
import { getPath } from 'renderer/lib/api-client/urls';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import HexLogo from '../Shared/HexLogo';

import labImage from '../Welcome/img/lab.jpg';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterUser';

function ForgotPasswordForm({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useAuth();

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Check your email
        </Typography>
        <Typography level="body-md">
          If an account exists for {email}, a password reset link has been sent.
          The link expires in 1 hour.
        </Typography>
        <Button
          onClick={onClose}
          color="primary"
          variant="solid"
          sx={{ mt: 3 }}
        >
          Back to Login
        </Button>
      </Box>
    );
  }

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
        <Button type="submit" variant="solid" sx={{ mt: 3 }}>
          Reset Password
        </Button>{' '}
        <Button type="button" onClick={onClose} color="danger" variant="plain">
          Cancel
        </Button>
      </form>
    </Box>
  );
}

function ResetPasswordForm({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const { fetchWithAuth } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchWithAuth(
        getPath('auth', ['resetPassword'], {}),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        },
      );

      if (response.ok) {
        setSuccess(true);
      } else {
        const data = await response.json().catch(() => ({}));
        const detail = data?.detail;
        if (detail === 'RESET_PASSWORD_BAD_TOKEN') {
          setError(
            'This password reset link is invalid or has expired. Please request a new one.',
          );
        } else if (
          detail &&
          typeof detail === 'object' &&
          detail.code === 'RESET_PASSWORD_INVALID_PASSWORD'
        ) {
          setError(detail.reason || 'Password does not meet requirements.');
        } else {
          setError(
            typeof detail === 'string'
              ? detail
              : 'Failed to reset password. Please try again.',
          );
        }
      }
    } catch (err) {
      setError(
        'Unable to connect to the server. Please check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Password Reset
        </Typography>
        <Typography level="body-md">
          Your password has been updated. You can now log in with your new
          password.
        </Typography>
        <Button
          onClick={onClose}
          color="primary"
          variant="solid"
          sx={{ mt: 3 }}
        >
          Back to Login
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Typography level="h4" component="div" sx={{ mb: 2 }}>
        Reset Password
      </Typography>

      <form onSubmit={handleSubmit}>
        <FormControl required sx={{ mb: 2 }}>
          <FormLabel>New Password</FormLabel>
          <Input
            type="password"
            placeholder="Enter new password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            slotProps={{ input: { autoComplete: 'new-password' } }}
          />
        </FormControl>
        <FormControl required>
          <FormLabel>Confirm New Password</FormLabel>
          <Input
            type="password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting}
            slotProps={{ input: { autoComplete: 'new-password' } }}
          />
        </FormControl>
        {error && (
          <Typography level="body-sm" color="danger" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
        <Button
          type="submit"
          variant="solid"
          loading={submitting}
          sx={{ mt: 3 }}
        >
          Update Password
        </Button>{' '}
        <Button
          type="button"
          onClick={onClose}
          color="danger"
          variant="plain"
          disabled={submitting}
        >
          Cancel
        </Button>
      </form>
    </Box>
  );
}

export default function LoginPage() {
  const [verifyMessage, setVerifyMessage] = useState('');
  const [hash, setHash] = useState(window.location.hash);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const authContext = useAuth();

  const navigate = useNavigate();

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    const hashWithoutSymbol = hash.substring(1);
    const queryIndex = hashWithoutSymbol.indexOf('?');
    const queryString =
      queryIndex !== -1 ? hashWithoutSymbol.substring(queryIndex + 1) : '';
    const params = new URLSearchParams(queryString);
    const token = params.get('token');
    const invitationToken = params.get('invitation_token');
    const resetTokenParam = params.get('reset_token');

    if (invitationToken) {
      localStorage.setItem('pending_invitation_token', invitationToken);
    }

    if (resetTokenParam) {
      setResetToken(resetTokenParam);
      window.location.hash = '#/';
    }

    if (token) {
      const verifyEmail = async () => {
        try {
          // Normalize TL_API_URL - ensure it's not "default" or empty, and mirror App.tsx behavior:
          // - For localhost or port 1212, assume API is on port 8338
          // - For non-localhost, assume API is served from the same origin as the frontend
          const envUrl = process.env.TL_API_URL;
          let apiUrl: string;

          if (!envUrl || envUrl === 'default' || envUrl.trim() === '') {
            const { protocol, hostname, port } = window.location;

            if (hostname === 'localhost' || hostname === '127.0.0.1') {
              apiUrl = `${protocol}//${hostname}:8338`;
            } else if (port === '1212') {
              apiUrl = `${protocol}//${hostname}:8338`;
            } else {
              const isDefaultHttpPort = port === '' || port === '80';
              const isDefaultHttpsPort = port === '' || port === '443';
              const isDefaultPort =
                (protocol === 'http:' && isDefaultHttpPort) ||
                (protocol === 'https:' && isDefaultHttpsPort);

              if (isDefaultPort) {
                apiUrl = `${protocol}//${hostname}`;
              } else {
                apiUrl = `${protocol}//${hostname}:${port}`;
              }
            }
          } else {
            apiUrl = envUrl.trim();
          }

          apiUrl = apiUrl.replace(/\/$/, '');
          const url = `${apiUrl}/auth/verify`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
          });

          if (response.ok) {
            setVerifyMessage('Email verified successfully');
            localStorage.setItem('just_verified', 'true');
            window.location.hash = window.location.hash.split('?')[0];
          } else {
            const data = await response.json();
            if (data.detail === 'VERIFY_USER_ALREADY_VERIFIED') {
              setVerifyMessage('Email is already verified. You can log in.');
            } else {
              setVerifyMessage(
                data.detail || 'Verification failed. Please try again.',
              );
            }
          }
        } catch (err) {
          setVerifyMessage('Verification failed. Please try again.');
        }
      };

      verifyEmail();
    }
  }, [hash]);

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
          {verifyMessage !== '' && (
            <Typography level="body-sm" color="success">
              {verifyMessage}
            </Typography>
          )}
          {resetToken ? (
            <ResetPasswordForm
              token={resetToken}
              onClose={() => {
                setResetToken(null);
                navigate('/');
              }}
            />
          ) : (
            <Routes>
              <Route
                path="/register"
                element={<RegisterForm onClose={() => navigate('/')} />}
              />
              <Route
                path="/forgot-password"
                element={<ForgotPasswordForm onClose={() => navigate('/')} />}
              />
              <Route path="*" element={<LoginForm />} />
            </Routes>
          )}
        </ModalDialog>
      </Modal>
    </Box>
  );
}
