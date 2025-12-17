#!/usr/bin/env node
import { useEffect, useState } from 'react';
// @ts-ignore (otherwise the import of ink gives a li)
import { render, Box, Text, useApp } from 'ink';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import open from 'open'; // We use this to open a URL in the browser
import Table from './ink-table'; // Custom Table component to fix issues with ink-table + bun

/* Import utility functions */
import {
  config,
  getGitContext,
  WEB_URL,
  API_URL,
  IS_LOCAL,
  getCredentials,
} from './utils';

/* Import common UI components */
import { Logo, Panel, SuccessMsg, ErrorMsg, Loading } from './ui';

/* Import all of our Tasks */
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
  TaskList,
} from './commands/tasks';
import { JobList, JobInfo, JobLogs } from './commands/jobs';

const ContextView = () => {
  const { exit } = useApp();
  const [git, setGit] = useState<any>(null);

  const { hasAPIKey, email } = getCredentials();

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
            {hasAPIKey ? email || 'Authenticated (API Key)' : 'Not logged in'}
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
    const target = IS_LOCAL ? 'Local Development' : 'Transformer Lab Cloud';
    const { hasToken, email } = getCredentials();

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
  if (command === 'web') {
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
  if (command === 'task:list') return <TaskList />;
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
    .command('web', 'Open Transformer Lab in your Browser', {}, (argv) => {
      render(<App command="web" args={argv} />);
    })

    // Task
    .command('task', 'Manage tasks', (y) => {
      return (
        y
          .usage('$0 task <cmd> [args]')
          .demandCommand(
            1,
            'Please specify a task subcommand. Use "lab task --help" for a list of available subcommands.',
          )
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
