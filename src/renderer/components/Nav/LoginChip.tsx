import React from 'react';
import Chip from '@mui/joy/Chip';
import Avatar from '@mui/joy/Avatar';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import { Button, Sheet } from '@mui/joy';
import { User2Icon } from 'lucide-react';
import { useAuth } from 'renderer/lib/authContext';

type Props = {};

export default function LoginChip({}: Props) {
  const authContext = useAuth();
  const user = authContext?.user;
  const teamName = user?.team?.name || (user ? 'Transformer Lab' : null);
  const avatarSrc = user?.avatar_url;
  const size = 'md';
  const email = user?.email || '';

  return (
    <Sheet
      variant="soft"
      color="success"
      // onClick={() => {
      //   alert('Auth Context:\n' + JSON.stringify(authContext, null, 2));
      // }}
      sx={{
        px: 1,
        py: 0.25,
        gap: 1,
        display: 'inline-flex',
        alignItems: 'center',
      }}
      aria-label={`Account: ${email}${teamName ? `, team ${teamName}` : ''}`}
    >
      <Avatar
        src={avatarSrc}
        size={size === 'sm' ? 'sm' : 'md'}
        sx={{ width: 32, height: 32 }}
        onClick={() => {
          alert('Auth Context:\n' + JSON.stringify(authContext, null, 2));
        }}
      >
        {!avatarSrc && <User2Icon />}
      </Avatar>
      <Stack spacing={0} sx={{ textAlign: 'left', minWidth: 0 }}>
        <Typography level="title-sm" textColor="text.primary" noWrap>
          {user?.email}
        </Typography>
        {teamName ? (
          <Typography level="body-xs" textColor="text.tertiary" noWrap>
            {teamName}
          </Typography>
        ) : null}
        {authContext?.isAuthenticated ? (
          <Button size="sm" variant="outlined" onClick={authContext?.logout}>
            Logout
          </Button>
        ) : (
          <Button size="sm" variant="outlined" onClick={authContext?.login}>
            Login
          </Button>
        )}
      </Stack>
    </Sheet>
  );
}
