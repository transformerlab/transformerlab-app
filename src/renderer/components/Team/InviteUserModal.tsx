import React, { useState } from 'react';
import {
  Box,
  Button,
  Input,
  Modal,
  ModalDialog,
  Select,
  Typography,
  Option,
} from '@mui/joy';
import { useAuth } from 'renderer/lib/authContext';
import { getPath } from 'renderer/lib/api-client/urls';

interface InviteUserModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
}

export default function InviteUserModal({
  open,
  onClose,
  teamId,
}: InviteUserModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const { fetchWithAuth } = useAuth();

  const handleInvite = async () => {
    if (!email.trim()) return;

    setLoading(true);
    try {
      const response = await fetchWithAuth(
        getPath('teams', ['inviteMember'], { teamId }),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, role }),
        },
      );

      if (response.ok) {
        onClose();
      } else {
        const errorData = await response.json();
        console.error('Error inviting user:', errorData);
      }
    } catch (error) {
      console.error('Error inviting user:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ gap: 0 }}>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Invite User
        </Typography>
        <Input
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder="Enter user email"
          fullWidth
        />
        <Select
          value={role}
          onChange={(event, value) => setRole(value ?? 'member')}
          sx={{ mt: 2, width: '100%' }}
        >
          <Option value="member">Member</Option>
          <Option value="owner">Owner</Option>
        </Select>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="outlined" onClick={onClose} sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button onClick={handleInvite} loading={loading}>
            Invite
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
