import React, { useState } from 'react';
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

  const { login } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

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

  return (
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
        </Typography>
      </Stack>
    </form>
  );
}
