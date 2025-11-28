import {
  Box,
  Button,
  List,
  ListItem,
  ListItemContent,
  Typography,
  ListItemButton,
  Stack,
  Modal,
  ModalDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Input,
  FormControl,
  FormLabel,
} from '@mui/joy';
import { useState } from 'react';
import { useAPI, useAuth } from 'renderer/lib/authContext';

function PasswordChangeForm({ open, onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { fetchWithAuth } = useAuth();

  const handleSave = async () => {
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    try {
      const response = await fetchWithAuth('users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: newPassword,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update password: ${response.statusText}`);
      }
      console.log('Password updated successfully');
      onClose();
    } catch (error) {
      console.error('Error updating password:', error);
    }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          <FormControl sx={{ mt: 2 }}>
            <FormLabel>New Password:</FormLabel>
            <Input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
            />
          </FormControl>
          <FormControl sx={{ mt: 1 }}>
            <Input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              fullWidth
            />
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="plain">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="solid">
            Save
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

function UserNameChangeForm({
  originalFirstName,
  originalLastName,
  open,
  onClose,
}) {
  const [firstName, setFirstName] = useState(originalFirstName);
  const [lastName, setLastName] = useState(originalLastName);
  const { fetchWithAuth } = useAuth();

  const handleSave = async () => {
    try {
      const response = await fetchWithAuth('users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update user: ${response.statusText}`);
      }

      console.log('User updated successfully');
      onClose();
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>Change Name</DialogTitle>
        <DialogContent>
          <FormControl sx={{ mt: 2 }}>
            <FormLabel>First Name</FormLabel>
            <Input
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              fullWidth
            />
          </FormControl>
          <FormControl sx={{ mt: 2 }}>
            <FormLabel>Last Name</FormLabel>
            <Input
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              fullWidth
            />
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="plain">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="solid">
            Save
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

export default function UserLoginTest(): JSX.Element {
  const authContext = useAuth();
  const [isNameChangeOpen, setIsNameChangeOpen] = useState(false);
  const { data: teams, mutate: teamsMutate } = useAPI('teams', ['list']);
  const { data: userInfo, mutate: userInfoMutate } = useAPI('users', ['me']);
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);

  return (
    <div>
      <Typography level="h2" mb={2}>
        User Settings
      </Typography>
      <Typography level="title-lg" mt={3}>
        User Profile:
      </Typography>
      <Stack gap={1} mt={1} maxWidth={400}>
        <Typography>
          Name:{' '}
          <b>
            {userInfo?.first_name} {userInfo?.last_name}
          </b>
        </Typography>
        <Typography>
          Email: <b>{userInfo?.email}</b>
        </Typography>
        <Button variant="outlined" onClick={() => setIsNameChangeOpen(true)}>
          Change Name
        </Button>
        {/* <Button variant="outlined">Change Profile Icon</Button> */}
        <Button
          variant="outlined"
          onClick={() => {
            setIsPasswordChangeOpen(true);
          }}
        >
          Change Password
        </Button>
        <PasswordChangeForm
          open={isPasswordChangeOpen}
          onClose={() => setIsPasswordChangeOpen(false)}
        />
      </Stack>
      <UserNameChangeForm
        open={isNameChangeOpen}
        onClose={() => {
          setIsNameChangeOpen(false);
          userInfoMutate();
        }}
        originalFirstName={userInfo?.first_name || ''}
        originalLastName={userInfo?.last_name || ''}
      />
      <Box>
        <Typography level="title-lg" mt={3}>
          Teams you belong to:
        </Typography>
        {/* {JSON.stringify(authContext, null, 2)} */}
        {teams?.teams && (
          <List>
            {teams.teams.map((team: any) => (
              <ListItem key={team.id}>
                <ListItemButton
                  // onClick={() => {
                  //   authContext.setTeam({ id: team.id, name: team.name });
                  // }}
                  selected={authContext.team?.id === team.id}
                >
                  <ListItemContent>
                    <Typography level="title-md">
                      {team.name}
                      {authContext.team?.id === team.id ? ' (current)' : ''}
                    </Typography>
                    <Typography level="body-xs">{team.id}</Typography>
                  </ListItemContent>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </div>
  );
}
