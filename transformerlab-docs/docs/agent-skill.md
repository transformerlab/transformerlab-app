---
sidebar_position: 16
---

# Agent Skill (for AI Coding Agents)

Transformer Lab ships an [agent skill](https://github.com/anthropics/skills) that teaches AI coding agents — Claude Code, and other compatible assistants — how to drive Transformer Lab through the [`lab` CLI](https://github.com/transformerlab/transformerlab-app/tree/main/cli).

Once installed, your agent knows how to:

- check job status and stream logs
- queue, upload, and edit training tasks
- list, add, and configure compute providers
- create models and upload/download datasets
- publish job outputs

…all by running `lab` commands on your behalf, from inside your normal coding session.

## Install

The easiest way is the bundled CLI command:

```bash
lab install-agent-skill
```

Behind the scenes this runs the following on your behalf:

```bash
npx skills add transformerlab/transformerlab-app --skill transformerlab-cli
```

You'll need [Node.js](https://nodejs.org) installed (`npx` ships with it). If `npx` is missing, the command will tell you.

If you prefer to run the underlying `npx` invocation directly, that one-liner above works on its own. (You'll still need the `lab` CLI installed for the skill itself to be useful — the skill drives Transformer Lab by calling `lab` commands.)

## What it teaches the agent

The skill is the same definition that lives in this repo at [`.agents/skills/transformerlab-cli/`](https://github.com/transformerlab/transformerlab-app/tree/main/.agents/skills/transformerlab-cli). It's a small bundle of instructions and command references that tells the agent which `lab` subcommands to use for common workflows, so you can ask things like:

- "What jobs are running on the lab cluster?"
- "Queue a training task using the dataset I just uploaded."
- "Stream logs for the last training job and tell me when it finishes."

…and the agent will translate those into the right `lab` calls.

## Updating

Re-run `lab install-agent-skill` (or the `npx` command) any time you upgrade Transformer Lab to pick up the latest version of the skill.
