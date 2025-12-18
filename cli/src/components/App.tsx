#!/usr/bin/env node
import { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import open from 'open'; // We use this to open a URL in the browser
import Table from '../ink-table'; // Custom Table component to fix issues with ink-table + bun

/* Import utility functions */
import {
  API_URL,
  debugLog,
  getConfig,
  getCredentials,
  saveConfig,
} from '../lib/utils';

/* Import common UI components */
import { Logo, Panel, SuccessMsg } from './ui';

/* Import all of our Tasks */
import { LoginCommand } from '../commands/login';
import { LogoutCommand } from '../commands/logout';
import { TaskInfo, TaskGallery, TaskList } from '../commands/tasks';
import { JobList, JobInfo, JobLogs } from '../commands/jobs';

export const App = ({ command, args }: { command: string; args: any }) => {
  // Root Command
  if (command === 'default') {
    // If there are any args, this is an unsupported command
    if (args._.length > 0) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Unsupported command</Text>
          <Text>
            Run{' '}
            <Text bold color="green">
              lab --help
            </Text>{' '}
            to see the list of available commands.
          </Text>
        </Box>
      );
    }

    const target = 'Transformer Lab Cloud';
    const { hasAPIKey, email } = getCredentials();

    const commandsData = [
      { Command: 'lab login', Description: 'Connect to your account' },
      {
        Command: 'lab --help',
        Description: 'Get more info on commands you can run',
      },
    ];

    return (
      <Box flexDirection="column" paddingBottom={1}>
        <Logo />
        <Panel title={`Environment: ${target}`} color={'cyan'}>
          <Text>API: {API_URL}</Text>
          {hasAPIKey ? (
            <Text>User: {email || 'Authenticated'}</Text>
          ) : (
            <Text dimColor>Status: Not logged in</Text>
          )}
        </Panel>
        <Text bold>Quick Start:</Text>
        <Table data={commandsData} />
        <Box marginTop={1}>
          <Text>
            Run{' '}
            <Text bold color="green">
              lab --help
            </Text>{' '}
            for the full command list.
          </Text>
        </Box>
      </Box>
    );
  }

  // Auth
  if (command === 'login') return <LoginCommand />;
  if (command === 'logout') return <LogoutCommand />;
  if (command === 'web') {
    const { exit } = useApp();
    useEffect(() => {
      open(API_URL).then(() => exit());
    }, []);
    return <SuccessMsg text={`Opening ${API_URL}...`} />;
  }

  // Task
  // if (command === 'task:add') {
  //   const dir = args.dir || '.';
  //   return <TaskAdd path={dir} repo={args.repo} branch={args.branch} />;
  // }
  // if (command === 'task:run') {
  //   const { _, $0, name, ...params } = args;
  //   return <TaskRun taskName={name} cliParams={params} />;
  // }
  if (command === 'task:info') return <TaskInfo taskId={args.id} />;
  if (command === 'task:gallery') return <TaskGallery />;
  if (command === 'task:list') return <TaskList />;
  // if (command === 'task:delete') return <TaskDelete taskId={args.id} />;
  // if (command === 'task:install') return <InstallFromGallery />;
  // if (command === 'task:export') return <ExportToGallery />;

  // Job
  if (command === 'job:list') return <JobList />;
  if (command === 'job:info') return <JobInfo jobId={args.id} />;
  if (command === 'job:logs') return <JobLogs jobId={args.id} />;

  // If there is no command, then
  if (command === 'unsupported') {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: Unsupported command</Text>
        <Text>
          Run{' '}
          <Text bold color="green">
            lab --help
          </Text>{' '}
          to see the list of available commands.
        </Text>
      </Box>
    );
  }

  if (command == 'config:list') {
    const config = getConfig();
    const configData = Object.entries(config).map(([key, value]) => ({
      Key: key,
      Value: value,
    }));
    return (
      <Box flexDirection="column">
        <Text bold>Current Configuration:</Text>
        <Table data={configData} />
      </Box>
    );
  }

  if (command === 'config:set') {
    const { key, value } = args;
    // Validate that there are both key and value and that key belongs to allowed set
    // of server, team_id, team_name, user_email
    if (
      !key ||
      !value ||
      !['server', 'team_id', 'team_name', 'user_email'].includes(key)
    ) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: Invalid configuration key or value</Text>
          <Text>
            Allowed keys are{' '}
            <Text bold color="green">
              server, team_id, team_name, user_email
            </Text>
            .
          </Text>
        </Box>
      );
    }
    debugLog(`Setting config ${key} = ${value}...`);
    saveConfig({ [key]: value });
    return <SuccessMsg text="Configuration updated successfully." />;
  }

  return <Text color="red">Unsupported command</Text>;
};
