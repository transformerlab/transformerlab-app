import { useEffect } from 'react';
import fs from 'fs';
import { Box, Text, useApp } from 'ink';
import { CREDENTIALS_PATH } from '../utils';
import { SuccessMsg } from '../components/ui';

export const LogoutCommand = () => {
  const { exit } = useApp();

  useEffect(() => {
    // config.delete('api_key');
    // config.delete('user_email');
    // config.delete('team_id');
    // config.delete('team_name');

    const creds = JSON.stringify({ api_key: '' }, null, 2);
    fs.writeFileSync(CREDENTIALS_PATH, creds, { mode: 0o600 });

    setTimeout(() => exit(), 800);
  }, [exit]);

  return (
    <Box flexDirection="column">
      <SuccessMsg text="Logged out successfully." />
      <Text dimColor>Local credentials have been cleared.</Text>
    </Box>
  );
};
