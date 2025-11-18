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
import { useAuth } from '../lib/authContext';
import HexLogo from './Shared/HexLogo';

import labImage from '../components/Welcome/img/lab.jpg';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
                type="submit"
                fullWidth
                loading={isLoading}
                sx={{ mt: 1 }}
              >
                Sign In
              </Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
