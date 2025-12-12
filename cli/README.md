    
# Transformer Lab CLI Demo

This is a functional MVP of the Transformer Lab Command Line Interface. It demonstrates the user workflow for managing tasks and jobs directly from the terminal, using a local JSON file to mock backend persistence.

    
# TransformerLab CLI (Ink Port)

A TypeScript/React-based CLI for TransformerLab, ported from the original Python/Typer implementation using [Ink](https://github.com/vadimdemedes/ink).

## Prerequisites

- Node.js (v18+)
- NPM or Yarn

## Installation

1. **Install Dependencies**
```bash
npm install
```


Build the Project
This compiles the TypeScript code to JavaScript in the dist/ folder.
```bash
npm run build
```

Link Command
This makes the lab command available globally on your system.
```bash  
npm link
```
  

## Deployment & Environments

The CLI supports both local development and production cloud usage.

### 1. Production Usage (lab.cloud)

TODO

### 2. Local Development (localhost)

If you are developing Transformer Lab itself, you will run the backend and frontend locally.

## Starting the Services:

# Backend:
```bash
cd api
./run.sh
# Runs on http://localhost:8000
```
  
# Frontend:
```bash
# In the root or frontend directory
npm run start:cloud
# Runs on http://localhost:3000
```
      

## Configuring the CLI for Localhost:
To force the CLI to talk to your local server instead of lab.cloud, set the TL_ENV environment variable:
```bash
# For a single session:
lab target local
lab context
# Output should show:
# API Endpoint: http://localhost:8338                 │
# Web Interface: http://localhost:1212  
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
lab gui
```
  

## TODOs & Roadmap

The following features are currently mocked with "To Be Implemented" or local simulation:

Real Authentication: Implement OAuth2 / Token exchange with the backend lab login.

Git Remote Verification: Actually check if the remote git repo is accessible by the server (currently warns based on heuristic).

Log Streaming: lab job info currently shows static mock metrics. Connect to WebSocket for live log streaming.

File Uploads: lab task add currently assumes git synchronization. Add support for direct file uploads/patching for uncommitted changes.
