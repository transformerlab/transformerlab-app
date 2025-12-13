#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { useEffect, useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import open from 'open';
import Table from 'ink-table';
import { config, getGitContext, WEB_URL, API_URL, IS_LOCAL } from './utils';
import { Logo, Panel, SuccessMsg, ErrorMsg, Loading } from './ui';
import { LoginCommand } from './commands/login';
import { LogoutCommand } from './commands/logout';
import {
  TaskAdd,
  TaskRun,
  TaskInfo,
  TaskGallery,
  TaskDelete,
  InstallFromGallery,
  ExportToGallery,
} from './commands/tasks';
import { JobList, JobInfo, JobLogs } from './commands/jobs';

const getLocalStatus = () => {
  try {
    const credsPath = path.join(os.homedir(), '.lab', 'credentials');
    const configPath = path.join(os.homedir(), '.lab', 'config.json');

    let hasToken = false;
    let email = null;

    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      if (creds.access_token) hasToken = true;
    }

    if (fs.existsSync(configPath)) {
      const conf = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      email = conf.user_email;
    }

    if (!email) email = config.get('user_email');

    return { hasToken, email };
  } catch (e) {
    return { hasToken: false, email: null };
  }
};

const TargetSwitch = ({ mode }: { mode: 'local' | 'cloud' }) => {
  const { exit } = useApp();
  useEffect(() => {
    config.set('target', mode);
    setTimeout(exit, 500);
  }, [exit, mode]);
  return (
    <Box flexDirection="column">
      <Logo />
      <SuccessMsg text={`Environment switched to: ${mode.toUpperCase()}`} />
      <Text dimColor>
        Target URL:{' '}
        {mode === 'local' ? `http://localhost:8338` : `https://api.lab.cloud`}
      </Text>
    </Box>
  );
};

const ContextView = () => {
  const { exit } = useApp();
  const [git, setGit] = useState<any>(null);

  const { hasToken, email } = getLocalStatus();

  useEffect(() => {
    getGitContext().then((g) => {
      setGit(g);
      exit();
    });
  }, [exit]);

  if (!git) return <Loading text="Loading context..." />;

  return (
    <Box flexDirection="column">
      <Panel title="System Context" color="magenta">
        <Box>
          <Text bold>API Endpoint: </Text>
          <Text>{API_URL}</Text>
        </Box>
        <Box>
          <Text bold>Web Interface: </Text>
          <Text>{WEB_URL}</Text>
        </Box>
        <Box>
          <Text bold>Logged in as: </Text>
          <Text>
            {hasToken ? email || 'Authenticated (API Key)' : 'Not logged in'}
          </Text>
        </Box>
        <Box height={1} />
        <Box>
          <Text bold>Git Repo: </Text>
          <Text>{git.repo}</Text>
        </Box>
        <Box>
          <Text bold>Git Ref: </Text>
          <Text>
            {git.branch} @ {git.sha.slice(0, 7)}
          </Text>
        </Box>
        {git.dirty && (
          <Text color="yellow">⚠ Uncommitted changes detected</Text>
        )}
      </Panel>
    </Box>
  );
};

const App = ({ command, args }: { command: string; args: any }) => {
  // Root Command
  if (command === 'default') {
    const target = IS_LOCAL ? 'Local Development' : 'TransformerLab Cloud';
    const { hasToken, email } = getLocalStatus();

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
        <Panel
          title={`Environment: ${target}`}
          color={IS_LOCAL ? 'yellow' : 'cyan'}
        >
          <Text>API: {API_URL}</Text>
          {hasToken ? (
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
  if (command === 'context') return <ContextView />;
  if (command === 'gui') {
    const { exit } = useApp();
    useEffect(() => {
      open(WEB_URL).then(() => exit());
    }, []);
    return <SuccessMsg text={`Opening ${WEB_URL}...`} />;
  }

  // Task
  if (command === 'task:add') {
    const dir = args.dir || '.';
    return <TaskAdd path={dir} repo={args.repo} branch={args.branch} />;
  }
  if (command === 'task:run') {
    const { _, $0, name, ...params } = args;
    return <TaskRun taskName={name} cliParams={params} />;
  }
  if (command === 'task:info') return <TaskInfo taskId={args.id} />;
  if (command === 'task:gallery') return <TaskGallery />;
  if (command === 'task:delete') return <TaskDelete taskId={args.id} />;
  if (command === 'task:install') return <InstallFromGallery />;
  if (command === 'task:export') return <ExportToGallery />;

  // Job
  if (command === 'job:list') return <JobList />;
  if (command === 'job:info') return <JobInfo jobId={args.id} />;
  if (command === 'job:logs') return <JobLogs jobId={args.id} />;

  return <Text color="red">Unknown command</Text>;
};

// --- Yargs ---
const run = () => {
  yargs(hideBin(process.argv))
    .scriptName('lab')
    .usage('$0 <cmd> [args]')

    // Root
    .command(
      '$0',
      'Show help',
      () => {},
      (argv) => {
        render(<App command="default" args={argv} />);
      },
    )

    // Core
    .command('login', 'Authenticate', {}, (argv) => {
      render(<App command="login" args={argv} />);
    })
    .command('logout', 'Log out', {}, (argv) => {
      render(<App command="logout" args={argv} />);
    })
    .command('settings', 'Configure Settings', {}, (argv) => {
      render(<App command="settings" args={argv} />);
    })
    .command('context', 'Show context', {}, (argv) => {
      render(<App command="context" args={argv} />);
    })
    .command('gui', 'Open Web UI', {}, (argv) => {
      render(<App command="gui" args={argv} />);
    })

    .command(
      'target <env>',
      'Switch environment',
      (y) => {
        return y.positional('env', { choices: ['local', 'cloud'] as const });
      },
      (argv) => {
        // @ts-ignore
        render(<TargetSwitch mode={argv.env} />);
      },
    )

    // Task
    .command('task', 'Manage tasks', (y) => {
      return (
        y
          .usage('$0 task <cmd> [args]')
          .command(
            'add [dir]',
            'Register current directory',
            (y) => {
              return y
                .option('repo', { type: 'string' })
                .option('branch', { type: 'string' });
            },
            (argv) => {
              render(<App command="task:add" args={argv} />);
            },
          )
          .command(
            'run <name>',
            'Trigger a task run',
            (y) => {
              return y
                .positional('name', { type: 'string' })
                .parserConfiguration({ 'unknown-options-as-args': true });
            },
            (argv) => {
              render(<App command="task:run" args={argv} />);
            },
          )
          // FIXED: Wrapped render calls in curly braces to return void
          .command('list', 'List tasks', {}, (argv) => {
            render(<App command="task:list" args={argv} />);
          })
          .command('info <id>', 'Task Info', {}, (argv) => {
            render(<App command="task:info" args={argv} />);
          })
          .command('delete <id>', 'Delete task', {}, (argv) => {
            render(<App command="task:delete" args={argv} />);
          })
          .command('gallery', 'Browse Gallery', {}, (argv) => {
            render(<App command="task:gallery" args={argv} />);
          })
          .command('install [id]', 'Install from Gallery', {}, (argv) => {
            render(<App command="task:install" args={argv} />);
          })
          .command('export', 'Export to Gallery', {}, (argv) => {
            render(<App command="task:export" args={argv} />);
          })
      );
    })

    // Job
    .command('job', 'Manage jobs', (y) => {
      return (
        y
          // FIXED: Wrapped render calls in curly braces to return void
          .command('list', 'List jobs', {}, (argv) => {
            render(<App command="job:list" args={argv} />);
          })
          .command('info <id>', 'Job info', {}, (argv) => {
            render(<App command="job:info" args={argv} />);
          })
          .command('logs <id>', 'Job logs', {}, (argv) => {
            render(<App command="job:logs" args={argv} />);
          })
          .command('stop <id>', 'Stop job', {}, (argv) => {
            render(<App command="job:stop" args={argv} />);
          })
          .command('delete <id>', 'Delete job', {}, (argv) => {
            render(<App command="job:delete" args={argv} />);
          })
      );
    })

    .help()
    .parse();
};

run();
