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
  Alert,
  IconButton,
  FormControl,
  FormLabel,
} from '@mui/joy';
import { CopyIcon } from 'lucide-react';
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
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { fetchWithAuth } = useAuth();

  const handleClose = () => {
    // Reset state when closing
    setEmail('');
    setRole('member');
    setInvitationUrl(null);
    setError(null);
    onClose();
  };

  const handleInvite = async () => {
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
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
        const data = await response.json();
        setInvitationUrl(data.invitation_url);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to send invitation');
        console.error('Error inviting user:', errorData);
      }
    } catch (error) {
      setError('Failed to send invitation. Please try again.');
      console.error('Error inviting user:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (invitationUrl) {
      navigator.clipboard.writeText(invitationUrl);
      // Show a brief success feedback (you could use a toast notification here)
      alert('Invitation link copied to clipboard!');
    }
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ gap: 0, minWidth: 500 }}>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Invite User
        </Typography>

        {invitationUrl ? (
          <>
            <Alert color="success" sx={{ mb: 2 }}>
              Invitation sent successfully! An email has been sent to {email}.
              You can also copy the invitation link below to share it manually.
            </Alert>
            <FormControl>
              <FormLabel>Invitation Link</FormLabel>
              <Input
                value={invitationUrl}
                readOnly
                endDecorator={
                  <IconButton onClick={copyToClipboard}>
                    <CopyIcon size={16} />
                  </IconButton>
                }
                sx={{ mt: 1 }}
              />
            </FormControl>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button onClick={handleClose}>Close</Button>
            </Box>
          </>
        ) : (
          <>
            {error && (
              <Alert color="danger" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
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
              <Button variant="outlined" onClick={handleClose} sx={{ mr: 1 }}>
                Cancel
              </Button>
              <Button onClick={handleInvite} loading={loading}>
                Invite
              </Button>
            </Box>
          </>
        )}
      </ModalDialog>
    </Modal>
  );
}
