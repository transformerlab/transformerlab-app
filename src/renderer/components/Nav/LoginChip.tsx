import React from 'react';
import Chip from '@mui/joy/Chip';
import Avatar from '@mui/joy/Avatar';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import { Button, IconButton, Sheet } from '@mui/joy';
import { LogOutIcon, User2Icon } from 'lucide-react';
import { useAuth } from 'renderer/lib/authContext';
import { useNavigate } from 'react-router-dom';

type Props = {};

export default function LoginChip({}: Props) {
  const authContext = useAuth();
  const navigate = useNavigate();
  const user = authContext?.user;
  const avatarSrc = user?.avatar_url;
  const size = 'md';
  const email = user?.email || '';

  const teamName = authContext?.team?.name || '';

  return (
    <Sheet
      // onClick={() => {
      //   alert('Auth Context:\n' + JSON.stringify(authContext, null, 2));
      // }}
      sx={{
        backgroundColor: 'transparent',
        px: 1,
        py: 0.25,
        gap: 1,
        display: 'inline-flex',
        alignItems: 'center',
      }}
      aria-label={`Account: ${email}${teamName ? `, team ${teamName}` : ''}`}
    >
      {/* <Avatar
        src={avatarSrc}
        size={size === 'sm' ? 'sm' : 'md'}
        sx={{ width: 32, height: 32 }}
        onClick={() => {
          alert('Auth Context:\n' + JSON.stringify(authContext, null, 2));
        }}
      >
        {!avatarSrc && <User2Icon />}
      </Avatar> */}
      <Stack spacing={0} sx={{ textAlign: 'left', minWidth: 0 }}>
        <Typography
          level="title-sm"
          noWrap
          onClick={() => {
            navigate('/user_info_test');
          }}
        >
          {user?.email}
        </Typography>
        {teamName ? (
          <Typography level="body-xs" textColor="text.tertiary" noWrap>
            {teamName}
          </Typography>
        ) : null}
      </Stack>{' '}
      {authContext?.isAuthenticated ? (
        <IconButton size="sm" variant="outlined" onClick={authContext?.logout}>
          <LogOutIcon />
        </IconButton>
      ) : (
        'Error: not logged in'
      )}
    </Sheet>
  );
}
