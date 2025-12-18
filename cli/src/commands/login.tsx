import { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { api } from '../lib/api';
import { LAB_DIR, CREDENTIALS_PATH, CONFIG_PATH, API_URL } from '../utils';
import { Logo, Loading, ErrorMsg, SuccessMsg, Panel } from '../components/ui';
import { debugLog } from '../utils';

type ViewState = 'INIT' | 'INPUT' | 'VERIFYING' | 'SELECT_TEAM' | 'SUCCESS';

export const LoginCommand = () => {
  const { exit } = useApp();

  const [view, setView] = useState<ViewState>('INIT');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [authResult, setAuthResult] = useState<any>(null);

  // 1. Initialize: Create ~/.lab directory if missing
  useEffect(() => {
    try {
      if (!fs.existsSync(LAB_DIR)) {
        fs.mkdirSync(LAB_DIR, { recursive: true });
      }
      setView('INPUT');
    } catch (err) {
      setError(`Could not create directory ${LAB_DIR}`);
      setView('INPUT');
    }
  }, []);

  // 2. Persist Data: Saves token and context to disk
  const persistLoginData = (apiKey: string, teamData: any) => {
    try {
      // Save Token (securely with 600 permissions)
      const creds = JSON.stringify({ api_key: apiKey }, null, 2);
      fs.writeFileSync(CREDENTIALS_PATH, creds, { mode: 0o600 });

      // Save Config (merging with existing if present)
      let existingConfig = {};
      if (fs.existsSync(CONFIG_PATH)) {
        try {
          existingConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        } catch (e) {
          /* ignore corrupt config */
        }
      }

      const newConfig = {
        ...existingConfig,
        team_id: teamData.value,
        team_name: teamData.label,
        user_email: authResult?.user?.email || 'API User',
      };

      fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
      return true;
    } catch (err: any) {
      setError(`Failed to save credentials: ${err.message}`);
      setView('INPUT');
      return false;
    }
  };

  // 3. Verify Token: Calls API
  const verifyToken = async () => {
    debugLog('Starting token verification');
    const cleanToken = token.trim();
    if (!cleanToken) {
      setError('Token cannot be empty.');
      return;
    }

    setView('VERIFYING');

    setError(null);

    try {
      const res = await api.verifyToken(cleanToken);
      setAuthResult(res);
      // setView('SELECT_TEAM');
      // Now save:
      const success = persistLoginData(cleanToken, {
        label: 'No Team Selected',
        value: '',
      });
      if (success) {
        setView('SUCCESS'); // we remove the set team functionality for now
      } else {
        setError('Failed to save credentials.');
        setView('INPUT');
      }
    } catch (e: any) {
      // Logic to handle specific API errors gracefully
      let msg = e.message || 'Unknown error occurred';

      setError(msg);
      setView('INPUT');
    }
  };

  // 4. Handle Team Select: Finalizes login
  const handleTeamSelect = (item: any) => {
    const success = persistLoginData(token.trim(), item);
    if (success) {
      setView('SUCCESS');
    }
  };

  // --- RENDERING ---

  const Header = () => (
    <Box flexDirection="column">
      <Logo />
      {error ? <ErrorMsg text="Login Failed" detail={error} /> : null}
    </Box>
  );

  if (view === 'INIT') return <Loading text="Initializing..." />;

  if (view === 'VERIFYING') {
    return (
      <Box flexDirection="column">
        <Header />
        <Loading text="Verifying API Key..." />
      </Box>
    );
  }

  if (view === 'INPUT') {
    return (
      <Box flexDirection="column">
        <Header />
        <Panel title="API Login" color="blue">
          <Text>Authentication is required.</Text>
          <Box marginTop={1}>
            <Text dimColor>1. Go to: </Text>
            <Text color="cyan" underline>
              {API_URL}/#/user
            </Text>
          </Box>
          <Text dimColor>2. Generate/Copy your API Key.</Text>
          <Text dimColor>3. Paste it below.</Text>
        </Panel>

        <Box marginTop={1}>
          <Text bold>Token: </Text>
          <TextInput
            value={token}
            onChange={(val) => {
              setToken(val);
              // Clear error immediately when user starts typing/editing
              if (error) setError(null);
            }}
            onSubmit={verifyToken}
            placeholder="Paste key here..."
          />
        </Box>
      </Box>
    );
  }

  if (view === 'SELECT_TEAM') {
    const teams =
      authResult?.teams?.map((t: any) => ({
        label: `${t.name} (${t.role})`,
        value: t.id,
      })) || [];

    if (teams.length === 0) {
      return (
        <Box flexDirection="column">
          <Header />
          <ErrorMsg
            text="No Teams Found"
            detail="Your API key is valid, but this user does not belong to any teams."
          />
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Header />
        <Text bold>Select Team Context:</Text>
        <Box borderStyle="single" paddingX={1} borderColor="gray">
          <SelectInput items={teams} onSelect={handleTeamSelect} />
        </Box>
      </Box>
    );
  }

  if (view === 'SUCCESS') {
    return (
      <Box flexDirection="column">
        <Header />
        <SuccessMsg text="Successfully authenticated." />
        <Text dimColor>Credentials saved to {CREDENTIALS_PATH}</Text>
        <Text dimColor>You may now use the lab cli</Text>
      </Box>
    );
  }

  return null;
};
