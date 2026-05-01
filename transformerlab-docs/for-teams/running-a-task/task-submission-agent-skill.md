---
title: Task Submission Using AI Agents
sidebar_position: 5
---

Transformer Lab ships an [Agent Skill](https://docs.claude.com/en/docs/claude-code/skills) that lets Claude Code (or any coding agent that supports skills) drive the `lab` CLI on your behalf. Once installed, you can ask your agent in natural language to create tasks, queue jobs on compute providers, stream logs, and pull down artifacts — without memorizing CLI flags or writing `task.yaml` by hand.

## Prerequisites

- Install the `lab` CLI with [uv](https://docs.astral.sh/uv/):

  ```bash
  uv tool install transformerlab-cli
  ```

  See [CLI](/for-teams/cli) for more install options and full command reference.

- [Claude Code](https://docs.claude.com/en/docs/claude-code) (or another agent harness that supports the skills format) is installed.

The agent will walk you through logging in and picking a current experiment the first time it needs them.

## Install the skill

From your project directory, install the skill with:

```bash
lab install-agent-skill
```

This is a thin wrapper that runs the following on your behalf:

```bash
npx skills add transformerlab/transformerlab-app --skill transformerlab-cli
```

You can run that `npx` command directly if you'd rather. Either way, you'll need [Node.js](https://nodejs.org) installed — `npx` ships with it.

This teaches your agent how to use `lab` to check job status, stream logs, download artifacts, queue tasks, manage providers, and more.

## Example: create and queue a fine-tune from a prompt

With the skill installed, start a Claude Code session and send:

> create a task that finetunes SmolLM2 on a fake dataset using the huggingface library.

Claude will:

- Scaffold a task directory with a `task.yaml` plus a small training script that uses the HuggingFace `transformers` library against a synthetic dataset.
- Register it in your current experiment by running `lab task add ./<task-dir>`.
- Report back the new task ID.

Once the task exists, follow up with:

> ok now queue this on our skypilot provider

Claude will call `lab task queue <task-id>`, pick the SkyPilot provider, fill in parameter defaults from `task.yaml`, and hand back the job ID. You can then ask it to tail logs, list artifacts, or download results — all of which map to existing `lab job ...` subcommands.

## What the agent can do

The skill exposes the full `lab` surface area to the agent, including:

- `lab task add` / `task list` / `task info` / `task delete`
- `lab task queue` (with provider selection and parameter prompting)
- `lab job list` / `job info` / `job artifacts` / `job download`
- `lab job monitor` (interactive TUI)
- `lab config` and `lab status` for inspecting CLI state

Because the agent is just driving the CLI, anything you can do from the terminal is available — the skill primarily teaches the agent _when_ and _how_ to reach for each command.

## Where to go next

- [Task Submission Using the CLI](task-submission-cli.md) — the underlying commands the agent uses.
- [Task YAML Structure](task-yaml-structure.md) — so you can review and tweak what the agent generated.
- [Task Parameters](task-parameters.md) — to understand the parameter schema the agent will fill in when queuing.
