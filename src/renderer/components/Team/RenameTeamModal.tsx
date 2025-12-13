import React, { useEffect, useState } from 'react';
import { Box, Button, Input, Modal, ModalDialog, Typography } from '@mui/joy';
import { useAuth } from 'renderer/lib/authContext';
import { getPath } from 'renderer/lib/api-client/urls';

interface RenameTeamModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  currentName: string;
}

export default function RenameTeamModal({
  open,
  onClose,
  teamId,
  currentName,
}: RenameTeamModalProps) {
  const [newName, setNewName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const { fetchWithAuth } = useAuth();

  useEffect(() => {
    setNewName(currentName);
  }, [open, currentName]);

  const handleRename = async () => {
    if (!newName.trim()) return;

    setLoading(true);
    try {
      const response = await fetchWithAuth(
        getPath('teams', ['rename'], { teamId }),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: newName }),
        },
      );

      if (response.ok) {
        onClose();
      } else {
        const errorData = await response.json();
      }
    } catch (error) {
      console.error('Error renaming team:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ gap: 0 }}>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Rename Team
        </Typography>
        <Input
          value={newName}
          onChange={(event) => setNewName(event.currentTarget.value)}
          placeholder="Enter new team name"
          fullWidth
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="outlined" onClick={onClose} sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button onClick={handleRename} loading={loading}>
            Rename
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
