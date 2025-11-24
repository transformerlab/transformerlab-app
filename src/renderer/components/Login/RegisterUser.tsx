import React, { useState } from 'react';
import { Box, Button, FormControl, Input, Stack, Typography } from '@mui/joy';
import { getPath } from 'renderer/lib/api-client/urls';
import { FaDiscord, FaGoogle } from 'react-icons/fa6';
import { useAuth } from '../../lib/authContext';

export default function RegisterForm({ onClose }: { onClose: () => void }) {
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
