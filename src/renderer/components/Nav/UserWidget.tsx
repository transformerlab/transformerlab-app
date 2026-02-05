import React, { useState, useEffect } from 'react';
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
  Dropdown,
  MenuButton,
  Skeleton,
} from '@mui/joy';
import {
  ArrowRightIcon,
  ChevronDown,
  ChevronDownIcon,
  ChevronUpIcon,
  CogIcon,
  LogOutIcon,
  SettingsIcon,
  TypeOutline,
  User2Icon,
  UserCog2Icon,
  UsersRoundIcon,
} from 'lucide-react';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { API_URL } from 'renderer/lib/api-client/urls';
import { useNavigate } from 'react-router-dom';

type Props = {};

const WIDGET_HEIGHT = 44;

export default function LoginChip({}: Props) {
  const authContext = useAuth();
  const navigate = useNavigate();
  const loading = authContext?.userIsLoading;
  const user = authContext?.user;
  const avatarSrc = user?.avatar_url;

  const email = user?.email || '';

  const teamName = authContext?.team?.name || '';

  const { data: teams } = useAPI('teams', ['list']);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});

  // Fetch logos for all teams
  useEffect(() => {
    if (!teams?.teams || !authContext?.fetchWithAuth) return;

    const fetchLogos = async () => {
      const logoMap: Record<string, string> = {};
      const base = API_URL();
      if (!base) {
        setTeamLogos({});
        return;
      }
      const promises = teams.teams.map(async (team: any) => {
        try {
          const res = await authContext.fetchWithAuth(`teams/${team.id}/logo`, {
            method: 'GET',
          });
          if (res.ok) {
            logoMap[team.id] = `${base}teams/${team.id}/logo`;
          }
        } catch (e) {
          // Logo not found is expected if no logo is set
        }
      });
      await Promise.all(promises);
      setTeamLogos(logoMap);
    };

    fetchLogos();
  }, [teams?.teams, authContext?.fetchWithAuth]);

  return (
    <Sheet
      sx={{
        backgroundColor: 'transparent',
        py: 0.25,
        px: 0.5,
        gap: 1,
        display: 'inline-flex',
        alignItems: 'center',
        height: WIDGET_HEIGHT,
      }}
      aria-label={`Account: ${email}${teamName ? `, team ${teamName}` : ''}`}
    >
      {loading ? (
        <Stack spacing={0.5} sx={{ width: '100%', p: 0.5 }}>
          <Skeleton variant="text" level="title-sm" width="80%" />
          <Skeleton variant="text" level="body-xs" width="60%" />
        </Stack>
      ) : (
        <>
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

          <Dropdown>
            <MenuButton
              variant="plain"
              color="neutral"
              sx={{
                justifyContent: 'space-between',
                width: '100%',
                gap: 1,
                p: 0.5,
                m: 0,
                border: 'none',
                boxShadow: 'none',
              }}
            >
              <Stack
                spacing={0}
                sx={{
                  textAlign: 'left',
                  minWidth: 0,
                  justifyContent: 'space-between',
                }}
              >
                <Typography level="title-sm" noWrap>
                  {user?.first_name
                    ? `${user.first_name} ${user.last_name}`
                    : user?.email}
                </Typography>
                {/* <Typography level="body-xs" textColor="text.tertiary" noWrap>
          {email}
        </Typography> */}
                {teamName ? (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {authContext?.team?.id && teamLogos[authContext.team.id] ? (
                      <Box
                        component="img"
                        src={teamLogos[authContext.team.id]}
                        alt={`${teamName} logo`}
                        sx={{
                          width: 12,
                          height: 12,
                          objectFit: 'contain',
                          borderRadius: 'xs',
                        }}
                      />
                    ) : null}
                    <Typography
                      level="body-xs"
                      textColor="text.tertiary"
                      noWrap
                    >
                      {teamName}
                    </Typography>
                  </Stack>
                ) : null}
              </Stack>
              <ChevronUpIcon size={16} />
            </MenuButton>
            <Menu>
              <MenuItem
                onClick={() => {
                  navigate('/user');
                }}
              >
                <ListItemDecorator>
                  <UserCog2Icon size={16} />
                </ListItemDecorator>
                User Settings
              </MenuItem>
              <MenuItem
                onClick={() => {
                  navigate('/team');
                }}
              >
                <ListItemDecorator>
                  <UsersRoundIcon size={16} />
                </ListItemDecorator>
                Team Settings
              </MenuItem>
              <Divider />
              {user && teams?.teams.length > 0 ? (
                // header indicator for teams (non-interactive)
                <MenuItem disabled>Select Team:</MenuItem>
              ) : null}
              {user &&
                teams?.teams.map((t: any) => {
                  const teamLogo = teamLogos[t.id];
                  return (
                    <MenuItem
                      key={t.id}
                      onClick={() => {
                        // try common setter names on authContext, otherwise navigate
                        authContext.setTeam(t);
                      }}
                      sx={{
                        fontWeight:
                          authContext.team?.id === t.id ? 'bold' : 'normal',
                      }}
                    >
                      <ListItemDecorator>
                        {authContext.team?.id === t.id ? (
                          <ArrowRightIcon size={16} strokeWidth={4} />
                        ) : teamLogo ? (
                          <Box
                            component="img"
                            src={teamLogo}
                            alt={`${t.name} logo`}
                            sx={{
                              width: 20,
                              height: 20,
                              objectFit: 'contain',
                              borderRadius: 'sm',
                            }}
                          />
                        ) : (
                          <User2Icon size={16} />
                        )}
                      </ListItemDecorator>
                      {t.name}
                    </MenuItem>
                  );
                })}
              <Divider />
              <MenuItem
                onClick={() => {
                  authContext?.logout?.();
                }}
              >
                <ListItemDecorator>
                  <LogOutIcon size={16} />
                </ListItemDecorator>
                Logout
              </MenuItem>
            </Menu>
          </Dropdown>
          {/* {authContext?.isAuthenticated ? (
        <IconButton size="sm" variant="outlined" onClick={authContext?.logout}>
          <LogOutIcon />
        </IconButton>
      ) : (
        'Error: not logged in'
      )} */}
        </>
      )}
    </Sheet>
  );
}
