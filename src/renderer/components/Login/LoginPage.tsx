import React, { useState, useEffect, useRef } from 'react';
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
import { getPath, API_URL } from 'renderer/lib/api-client/urls';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import HexLogo from '../Shared/HexLogo';

import labImage from '../Welcome/img/lab.jpg';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterUser';

function ForgotPasswordForm({ onClose }: { onClose: () => void }) {
  const { fetchWithAuth } = useAuth();

  const [email, setEmail] = useState('');

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

export default function LoginPage() {
  const [verifyMessage, setVerifyMessage] = useState('');
  const [hash, setHash] = useState(window.location.hash);
  const autoLoginAttemptedRef = useRef(false);

  const authContext = useAuth();

  const navigate = useNavigate();

  useEffect(() => {
    if (autoLoginAttemptedRef.current || authContext.isAuthenticated) {
      return;
    }

    const autoLogin = async () => {
      // Only attempt auto-login if we have a valid API URL (connection is established)
      const apiUrl = API_URL();
      if (!apiUrl) {
        console.log(
          'Skipping auto-login: no API URL available. Connection modal should show first.',
        );
        return;
      }

      autoLoginAttemptedRef.current = true;
      try {
        console.log('Attempting auto-login for single user mode');
        await authContext.login('admin@example.com', 'admin123');
      } catch (error) {
        console.error('Auto-login failed:', error);
      }
    };

    const isMultiUserMode =
      (window as any).platform?.multiuser === true ||
      (typeof process !== 'undefined' &&
        process.env &&
        process.env.MULTIUSER === 'true');

    if (!isMultiUserMode) {
      autoLogin();
    }
  }, [authContext.isAuthenticated, authContext.login]);

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

    if (invitationToken) {
      localStorage.setItem('pending_invitation_token', invitationToken);
    }

    if (token) {
      const verifyEmail = async () => {
        try {
          // Normalize TL_API_URL - ensure it's not "default" or empty
          const envUrl = process.env.TL_API_URL;
          let apiUrl =
            !envUrl || envUrl === 'default' || envUrl.trim() === ''
              ? `${window.location.protocol}//${window.location.hostname}:8338`
              : envUrl;
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
        </ModalDialog>
      </Modal>
    </Box>
  );
}
