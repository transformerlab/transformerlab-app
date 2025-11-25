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

export default function ProviderDetailsModal({
  open,
  onClose,
  teamId,
}: InviteUserModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);
  const { fetchWithAuth } = useAuth();

  const createProvider = async () => {
    setLoading(true);

    // Temporary hardcoded config
    const config = {
        "server_url": "http://localhost:46580",
        "default_env_vars": {
            "SKYPILOT_USER_ID": "1754943188",
            "SKYPILOT_USER": "tony"
        },
        "default_entrypoint_command": ""
    };
    try {
      const response = await fetchWithAuth(
        getPath('providers', ['create'], { teamId }),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, type, config }),
        },
      );

      if (response.ok) {
        onClose();
      } else {
        const errorData = await response.json();
        console.error('Error updating provider:', errorData);
      }
    } catch (error) {
      console.error('Error updating provider:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ gap: 0 }}>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Add Provider
        </Typography>
        <Input
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder="Enter friendly name for provider"
          fullWidth
        />
        <Select
          value={type}
          onChange={(event, value) => setType(value ?? 'skypilot')}
          sx={{ mt: 2, width: '100%' }}
        >
          <Option value="skypilot">Skypilot</Option>
          <Option value="slurm">Slurm</Option>
        </Select>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="outlined" onClick={onClose} sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button onClick={createProvider} loading={loading}>
            Invite
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
