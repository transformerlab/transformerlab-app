#!/usr/bin/env node
import { render } from 'ink';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { App } from './components/App';
import { debugLog } from './lib/utils';

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

    // Config
    .command(
      'config [key] [value]',
      'Set or view configuration key-value pairs',
      (y) => {
        return y
          .positional('key', { type: 'string', describe: 'Configuration key' })
          .positional('value', {
            type: 'string',
            describe: 'Configuration value',
          });
      },
      (argv) => {
        render(<App command="config:set" args={argv} />);
      },
    )

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
    .help()
    .parse();
};

run();
