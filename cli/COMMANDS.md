# Transformer Lab CLI - Command Reference

## Global Options

```
lab [OPTIONS] COMMAND [ARGS]...
```

| Option     | Description                          | Default  |
|------------|--------------------------------------|----------|
| `--format` | Output format: `pretty` or `json`    | `pretty` |
| `--help`   | Show help message and exit           |          |

---

## Commands

### `version`

Display the CLI version.

```bash
lab version
```

---

### `status`

Check the status of the server and configuration.

```bash
lab status
```

---

### `login`

Log in to Transformer Lab. Prompts for server URL and API key if not provided.

```bash
# Interactive login (prompts for server and API key)
lab login

# Login with options
lab login --server https://my-server:8338 --api-key YOUR_API_KEY
```

| Option      | Description     |
|-------------|-----------------|
| `--api-key` | Your API key    |
| `--server`  | Server URL      |

---

### `logout`

Log out from Transformer Lab by deleting the stored API key.

```bash
lab logout
```

---

### `whoami`

Show the current logged-in user, team information, and server.

```bash
lab whoami

# JSON output
lab --format json whoami
```

---

### `config`

View or set configuration values.

```bash
# View all configuration values
lab config

# Set a configuration value
lab config <key> <value>

# Examples
lab config server http://localhost:8000
lab config current_experiment my_experiment
```

| Argument | Description            |
|----------|------------------------|
| `key`    | Config key to set      |
| `value`  | Config value to set    |

---

### `task`

Task management commands. Requires `current_experiment` to be set in config.

#### `task list`

List all remote tasks in the current experiment.

```bash
lab task list
```

#### `task add`

Add a new task from a local directory or a Git repository.

```bash
# Add from a local directory containing task.yaml
lab task add ./my-task-directory

# Preview without creating (dry run)
lab task add ./my-task-directory --dry-run

# Add from a Git repository
lab task add --from-git https://github.com/user/repo
```

| Argument         | Description                                       |
|------------------|---------------------------------------------------|
| `task_directory`  | Path to the task directory containing `task.yaml` |

| Option       | Description                              |
|--------------|------------------------------------------|
| `--from-git` | Git URL to fetch the task from           |
| `--dry-run`  | Preview the task without creating it     |

#### `task info`

Get detailed information for a specific task.

```bash
lab task info <task_id>
```

#### `task delete`

Delete a task by ID.

```bash
lab task delete <task_id>
```

#### `task queue`

Queue a task on a compute provider. Interactively prompts for provider selection and parameter values.

```bash
# Interactive mode (prompts for provider and parameters)
lab task queue <task_id>

# Non-interactive mode (uses defaults)
lab task queue <task_id> --no-interactive
```

| Option             | Description                                    |
|--------------------|------------------------------------------------|
| `--no-interactive` | Skip interactive prompts and use defaults      |

---

### `job`

Job management commands. Most subcommands require `current_experiment` to be set in config.

#### `job list`

List all jobs for the current experiment.

```bash
lab job list
```

#### `job info`

Get detailed information for a specific job.

```bash
lab job info <job_id>
```

#### `job artifacts`

List artifacts for a specific job.

```bash
lab job artifacts <job_id>
```

#### `job download`

Download all artifacts for a job as a zip file.

```bash
# Download to current directory
lab job download <job_id>

# Download to a specific directory
lab job download <job_id> --output ./downloads
```

| Option          | Description                                                  |
|-----------------|--------------------------------------------------------------|
| `-o`, `--output`| Output directory for the zip file (default: current directory)|

#### `job monitor`

Launch the interactive job monitor TUI.

```bash
lab job monitor
```
