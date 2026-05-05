---
name: lab-autoresearch
description: Autonomous experiment loop on top of the Transformer Lab `lab` CLI — pick an idea, queue a job, score it, keep or discard, repeat. Use when the user types `/lab-autoresearch`, says "run autoresearch", "optimize X in a loop", "set up autoresearch for …", or asks to run an autonomous experimentation / optimization loop against Transformer Lab.
allowed-tools: Bash(lab *), Bash(curl *beta.lab.cloud*), Bash(curl *localhost:8338*)
---

# /lab-autoresearch

This skill is the entry point for the autonomous experiment loop. The full spec lives in the `transformerlab-cli` skill — this skill exists so that typing `/lab-autoresearch` resolves to a real skill instead of falling through.

## What to do

1. **Read the spec first.** The authoritative workflow, subcommands (`init <goal>`, `run`, `finalize`), experiment-notes template, loop rules (parallelism, fire-and-advance, stale-job sweep, keep/discard policy, run-description discipline), and natural-language → `lab` mapping all live in:

   `.claude/skills/transformerlab-cli/references/autoresearch.md`

   (or, in the source repo, `.agents/skills/transformerlab-cli/references/autoresearch.md`)

2. **Then use the `transformerlab-cli` skill** for every `lab` command the loop issues. That skill has the command reference, troubleshooting, and the rule that you must use `lab` (not raw `curl`) for normal operations.

## Quick orientation

The loop is layered on the `lab` CLI:

- One **experiment** per session, one **job** per iteration.
- A job's `-m/--description` is the iteration note; its `score` dict (set via `lab.finish(score=…)`) is the result; `lab job discard` is the keep/discard flag.
- For hyperparameter fan-out, prefer the task's `sweeps:` block over manually queuing N jobs.
- The session plan (objective, files in scope, constraints, backlog, what's been tried) is written to **experiment notes** via `lab notes` — there is no local `autoresearch.md` file.

Everything beyond `init` / `run` / `finalize` (status, keep/discard, sweeps, ideas, stopping running jobs, exiting the loop) is just the agent running the right `lab` call in response to natural-language requests — no dedicated subcommand needed.

**Do not improvise the loop without reading `references/autoresearch.md` first.** The rules around parallelism, fire-and-advance, and stale-job sweeps are load-bearing and not derivable from the `lab` CLI alone.
