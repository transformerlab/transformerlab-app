#!/usr/bin/env node
import { useEffect } from 'react';
import { render, Box, Text, useApp } from 'ink';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import open from 'open'; // We use this to open a URL in the browser
import Table from './ink-table'; // Custom Table component to fix issues with ink-table + bun

/* Import utility functions */
import { API_URL, IS_LOCAL, getCredentials } from './utils';

/* Import common UI components */
import { Logo, Panel, SuccessMsg } from './ui';

/* Import all of our Tasks */
import { LoginCommand } from './commands/login';
import { LogoutCommand } from './commands/logout';
import { TaskInfo, TaskGallery, TaskList } from './commands/tasks';
import { JobList, JobInfo, JobLogs } from './commands/jobs';

const App = ({ command, args }: { command: string; args: any }) => {
  // Root Command
  if (command === 'default') {
    const target = IS_LOCAL ? 'Local Development' : 'Transformer Lab Cloud';
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
        <Panel
          title={`Environment: ${target}`}
          color={IS_LOCAL ? 'yellow' : 'cyan'}
        >
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

  return <Text color="red">Unsupported command</Text>;
};

/*
  This is the main function that runs our CLI
  It uses yargs to parse commands and render the appropriate component
  which right now is always the app with a command but
  later we could make each subsection it's own
  component
*/
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
      return y
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
        .command(
          '*',
          'Handle unsupported task subcommands',
          () => {},
          (argv) => {
            render(<App command="unsupported" args={argv} />);
          },
        );
    })

    // // Job
    // .command('job', 'Manage jobs', (y) => {
    //   return (
    //     y
    //       // FIXED: Wrapped render calls in curly braces to return void
    //       .command('list', 'List jobs', {}, (argv) => {
    //         render(<App command="job:list" args={argv} />);
    //       })
    //       .command('info <id>', 'Job info', {}, (argv) => {
    //         render(<App command="job:info" args={argv} />);
    //       })
    //       .command('logs <id>', 'Job logs', {}, (argv) => {
    //         render(<App command="job:logs" args={argv} />);
    //       })
    //       .command('stop <id>', 'Stop job', {}, (argv) => {
    //         render(<App command="job:stop" args={argv} />);
    //       })
    //       .command('delete <id>', 'Delete job', {}, (argv) => {
    //         render(<App command="job:delete" args={argv} />);
    //       })
    //   );
    // })
    // Fallback for unsupported commands
    .command(
      '*',
      'Handle unsupported commands',
      () => {},
      (argv) => {
        // Check if no arguments were passed
        if (argv._.length === 0) {
          render(<App command="default" args={argv} />);
        } else {
          render(<App command="unsupported" args={argv} />);
        }
      },
    )
    .help()
    .parse();
};

run();
