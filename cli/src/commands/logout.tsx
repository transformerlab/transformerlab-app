import { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { config } from '../utils';
import { Logo, SuccessMsg } from '../ui';

export const LogoutCommand = () => {
  const { exit } = useApp();

  useEffect(() => {
    config.delete('access_token');
    config.delete('user_email');
    config.delete('team_id');
    config.delete('team_name');

    setTimeout(() => exit(), 800);
  }, [exit]);

  return (
    <Box flexDirection="column">
      <SuccessMsg text="Logged out successfully." />
      <Text dimColor>Local credentials have been cleared.</Text>
    </Box>
  );
};
