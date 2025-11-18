import React, { useState } from 'react';
import Chip from '@mui/joy/Chip';
import Avatar from '@mui/joy/Avatar';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import {
  Button,
  IconButton,
  Sheet,
  Menu,
  MenuItem,
  Divider,
  ListItemDecorator,
} from '@mui/joy';
import {
  ArrowRightIcon,
  ChevronDown,
  ChevronDownIcon,
  ChevronUpIcon,
  CogIcon,
  LogOutIcon,
  SettingsIcon,
  User2Icon,
  UserCog2Icon,
} from 'lucide-react';
import { useAPI, useAuth } from 'renderer/lib/authContext';
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

  // menu anchor state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(menuAnchor);

  const { data: teams } = useAPI('teams', ['list']);

  const toggleMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (menuAnchor) {
      setMenuAnchor(null);
    } else {
      setMenuAnchor(e.currentTarget);
    }
  };
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Sheet
      // onClick={() => {
      //   alert('Auth Context:\n' + JSON.stringify(authContext, null, 2));
      // }}
      sx={{
        backgroundColor: 'transparent',
        py: 0.25,
        px: 0.5,
        gap: 1,
        display: 'inline-flex',
        alignItems: 'center',
      }}
      aria-label={`Account: ${email}${teamName ? `, team ${teamName}` : ''}`}
    >
      {/* <Avatar
        src={avatarSrc}
        size={size === 'sm' ? 'sm' : 'md'}
        sx={{ width: 16, height: 16 }}
        onClick={() => {
          alert('Auth Context:\n' + JSON.stringify(authContext, null, 2));
        }}
      >
        {!avatarSrc && <User2Icon size={16} />}
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
      </Stack>
      <IconButton
        size="sm"
        onClick={toggleMenu}
        aria-haspopup="true"
        aria-expanded={menuOpen}
      >
        {menuOpen ? <ChevronDownIcon size={16} /> : <ChevronUpIcon size={16} />}
      </IconButton>

      <Menu open={menuOpen} anchorEl={menuAnchor} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            closeMenu();
            // navigate to an edit page for the current team; adjust path as needed
            navigate('/team');
          }}
        >
          <ListItemDecorator>
            <SettingsIcon size={16} />
          </ListItemDecorator>
          Team Settings
        </MenuItem>
        <Divider />
        {teams?.teams.length > 0 ? (
          // header indicator for teams (non-interactive)
          <MenuItem disabled>Select Team:</MenuItem>
        ) : null}
        {teams?.teams.map((t: any) => (
          <MenuItem
            key={t.id}
            onClick={() => {
              closeMenu();
              // try common setter names on authContext, otherwise navigate
              authContext.setTeam(t);
            }}
            sx={{
              fontWeight: authContext.team?.id === t.id ? 'bold' : 'normal',
            }}
          >
            <ListItemDecorator>
              {authContext.team?.id === t.id ? (
                <ArrowRightIcon size={16} strokeWidth={4} />
              ) : null}
            </ListItemDecorator>
            {t.name}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            closeMenu();
            authContext?.logout?.();
          }}
        >
          <ListItemDecorator>
            <LogOutIcon size={16} />
          </ListItemDecorator>
          Logout
        </MenuItem>
      </Menu>
      {/* {authContext?.isAuthenticated ? (
        <IconButton size="sm" variant="outlined" onClick={authContext?.logout}>
          <LogOutIcon />
        </IconButton>
      ) : (
        'Error: not logged in'
      )} */}
    </Sheet>
  );
}
