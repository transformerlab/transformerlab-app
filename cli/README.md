
    
# Transformer Lab CLI

Transformer Lab CLI

## Dev Prerequisites

- Bun

## Installation

1. **Install Dependencies**
```bash
bun install
```

2. **Build the Project**
```bash
bun run build
```
  
## Usage

Once installed, you can access the CLI using the lab command.
1. Basics
```bash
# Check status and help
lab

# Login 
lab login

# View current git context
lab context
```

2. Managing Tasks

Navigate to a folder with code (or use the current folder) and add it as a task.
```bash 
# Add the current directory as a task
# Follow the interactive prompts!
lab task add .

# Run a specific task (use the name generated in the previous step)
lab task run task-17098234
```

3. Monitoring Jobs
```bash
# See what is running
lab job list

# Get details on a specific job
lab job info job-17098235
``` 

4. Interface
```bash
# Open the web dashboard
lab web
```
