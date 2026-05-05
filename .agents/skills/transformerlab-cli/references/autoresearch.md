# `/autoresearch` — Autonomous Experiment Loop

Autonomous optimization loop that runs as a workflow on top of the `lab` CLI: pick an idea, queue it as a job, score it, keep what works, discard what doesn't, repeat. Inspired by [`pi-autoresearch`](https://github.com/davebcn87/pi-autoresearch) but adapted to Transformer Lab — there is no extension, no `autoresearch.jsonl`, no local `autoresearch.md` file, and no separate widget. Everything is stored on the **experiment** and on each **job** record:

- **Experiment** = the autoresearch session. One experiment per session.
- **Experiment notes** (`lab notes`) = the **session plan**: goal, metric, files in scope, off-limits, constraints, backlog, what's-been-tried. Lives on the experiment record itself; any agent that joins the experiment can `lab notes show --raw` to rehydrate. **This replaces the old `autoresearch.md` file** — there is no longer a local plan file to manage.
- **Job description** (`-m/--description`) = what was attempted in that iteration.
- **Job score** (`lab.finish(score={...})`) = primary + secondary metrics, set by the task itself.
- **Job discard flag** (`lab job discard <id>` / `--undo`) = keep vs reject.
- **`lab job list --score-metric <name>`** = the ranked dashboard.

### Reading and writing the plan

The plan lives in experiment notes. See the parent skill's "Experiment Notes" section for the command surface; the autoresearch-specific patterns:

- **Read** (always cheap, do it at the start of every iteration):
  ```bash
  lab notes show --raw
  ```
- **Initial write** when notes are empty (e.g. just after `lab experiment create`): a single `append` writes the content directly with no leading newline.
  ```bash
  lab notes append "$(cat <<'EOF'
  # Autoresearch: <goal>
  ...
  EOF
  )"
  ```
- **Append-only updates** (Backlog entries, "tried X, learned Y" log lines): `lab notes append "<text>"`. Always lead with today's date so the log stays chronological.
- **Full rewrites** (e.g. consolidating **What's been tried** every ~5 iterations): there is no `lab notes set --from-file`. The escape hatch is `tee` as `$EDITOR` — `lab notes edit` runs `$EDITOR <tmp_path>`, and `tee <tmp_path>` reads from stdin and overwrites the temp file. Pipe the new content in:
  ```bash
  cat > /tmp/new_notes.md <<'EOF'
  ...full new notes content...
  EOF
  EDITOR=tee lab notes edit < /tmp/new_notes.md > /dev/null
  ```
  Prefer **append** in the hot loop and reserve full rewrites for periodic consolidation. (If `lab notes set --from-file` ever lands, replace this incantation with it.)

## When to use

Trigger on requests like:

- "run autoresearch on …", "optimize X in a loop", "set up an autoresearch experiment for …"
- explicit `/autoresearch …` slash-style invocations the user types

## Subcommands

Only three commands earn dedicated treatment because they bundle multi-step rituals that aren't obvious from the parent skill alone:

| Subcommand | Purpose |
|---|---|
| `/autoresearch init <goal>` | Set up a new session: create experiment, ask provider, scaffold task, **write the plan to `lab notes`**, queue baseline. |
| `/autoresearch run` | Enter the loop: **`lab notes show --raw` to rehydrate**, pick next idea, queue up to N parallel jobs, score, keep/discard, sweep stale jobs, repeat. |
| `/autoresearch finalize` | Summarize best run, update **What's been tried** in experiment notes, offer to publish model/dataset. |

Everything else during a session — checking status, marking a run kept or discarded, adding an idea, stopping running jobs, exiting the loop, launching a sweep — is just the agent running the right `lab` call from the parent skill. See **During-session operations** below for the natural-language → `lab` mapping. Always use `lab --no-interactive`, never `--yes`/`-y`.

---

## `/autoresearch init <goal>`

One-time setup. Five things to gather (ask only what you can't infer from context):

1. **Goal** — what is being optimized, in plain language.
2. **Primary metric** — name (e.g. `eval/loss`), unit, direction (`lower` / `higher` is better).
3. **Secondary metrics** — names only; tradeoff monitors that don't gate keep/discard.
4. **Task** — either an existing task ID, or a workload to scaffold via `lab task init`.
5. **Parallelism** — max concurrent jobs (default `1`; ask before going higher because each running job consumes provider capacity). On non-Local providers (SkyPilot, RunPod, Slurm) **never raise parallelism past 1 without explicit user approval** — each concurrent job costs real money.
6. **Provider** — ask the user once, up front, which compute provider to target (run `lab provider list` first so you can name the options). If the user has no preference, use the team default (whatever `lab task queue --no-interactive` picks). Record the choice in the experiment notes so resuming agents don't re-ask.
7. **Max iterations** — optional cap to bound cost. If set, the agent stops the loop and reports when reached.

### Search strategy depends on parallelism

The parallelism budget changes the *kind* of session you're running, not just throughput:

- **N = 1 — depth.** One experiment at a time means each iteration is expensive. Pick deliberate, high-leverage edits. Read the code, study the last result, form a hypothesis. Greedy hill-climb up the metric.
- **N ≥ 4 — breadth.** Many concurrent experiments mean individual losses are cheap. Cast wider — vary multiple axes at once, accept regressions as data, cross-reference results. The loop becomes grid search instead of hill-climbing. Bias toward sweeps over agent-driven param tweaking when the change is purely numeric.

Tell the user this when they pick N. Don't run a high-N session with low-N habits (or vice versa).

### The fixed-evaluator / mutable-implementation split

The single most important property of the loop is that the agent **cannot cheat the metric**. Structure the task so that:

- The **score computation** — whatever feeds `lab.finish(score=…)` — is treated as a fixed evaluator. List it under **Off limits** in the experiment notes.
- The **implementation under test** is the only thing the agent edits. List it under **Files in scope** in the experiment notes.

For non-trivial workloads, split the task directory into two files:

```
my-task/
  score.py      # OFF LIMITS — computes the metric, calls lab.finish(score=…)
  solve.py      # MUTABLE   — the implementation the agent optimizes
  main.py       # entrypoint: imports solve, hands result to score
  task.yaml
```

If the metric and implementation can't be cleanly separated (e.g. ML training loss is computed inside the training step), pin the **lines** that compute and report the score as off-limits, and call this out explicitly in the experiment notes.

Then execute:

```bash
# 1. Create a fresh experiment for this session and switch to it.
SLUG=$(echo "<goal>" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')
DATE=$(date +%Y%m%d)
lab experiment create "autoresearch-${SLUG}-${DATE}" --set-default

# 2. Scaffold or confirm the task. The task MUST call lab.finish(score={...}).
mkdir -p "autoresearch-${SLUG}" && cd "autoresearch-${SLUG}"
lab task init   # if no task exists yet — then edit main.py to compute & report the metric
echo "y" | lab task add . --no-interactive

# 3. Write the session plan to experiment notes (template below).
#    Notes are empty after `lab experiment create`, so a single `append` writes
#    the content with no leading newline.
lab notes append "$(cat <<'EOF'
# Autoresearch: <goal>
...full plan, see template below...
EOF
)"

# 4. Queue the baseline. Description MUST say "Baseline" so it's identifiable.
lab task queue <TASK_ID> --no-interactive -m "Baseline — unmodified workload, establishing initial <primary metric> for the session."
```

The task's `main.py` must end with something like:

```python
lab.finish(
    message="ok",
    score={
        "<primary_metric>": float(primary_value),
        "<secondary_metric>": float(secondary_value),
        # ...
    },
)
```

`score.discard` is reserved — set by `lab job discard`, not by the task.

### Experiment notes template

The experiment notes hold the entire session plan — the **single source of truth** that any future agent reads to continue the work. A fresh agent (after a context reset, restart, or `/autoresearch run` resume) runs `lab notes show --raw` plus `lab job list --score-metric <primary>` and continues exactly where the prior session stopped. There is no `autoresearch.md` file; do not create one.

```markdown
# Autoresearch: <goal>

**Experiment:** `autoresearch-<slug>-<date>`
**Primary metric:** `<name>` — <unit>, <lower|higher> is better
**Secondary metrics:** `<name>`, `<name>`, ...
**Task:** `<task_id>`
**Provider:** `<provider_name>` (or "team default")
**Parallelism:** <N>
**Max iterations:** <N or "unbounded">
**Stale-job timeout:** <minutes> — runs exceeding this are stopped via `lab job stop`

## Objective
<One paragraph: what's being optimized and the workload behind the metric.>

## How a run is scored
The task calls `lab.finish(score={"<primary>": value, ...})`. Use
`lab job list --score-metric <primary>` to rank.

## Files in scope
<Files the agent may modify between iterations — the **mutable implementation under test**.>

## Off limits
<The **fixed evaluator** — the score-computation code that feeds `lab.finish(score=…)` —
plus any other files / tasks / providers that must not be touched. The agent
must not modify these even to "fix" a metric regression.>

## Constraints
<Hard rules: tests must pass, no new deps, no GPU > X, etc.>

## Backlog
<Promising ideas not yet tried. Append plain bullets here whenever an idea surfaces but isn't being pursued right now. Append via `lab notes append "- <idea>"`.>

## What's been tried
<Updated periodically by the agent. One bullet per cluster of related runs:
the hypothesis, the result, what was learned. Discarded runs lose their code
on revert — this section is the only durable record of dead ends. Use `lab notes append` for one-off log lines; reserve the `EDITOR=tee lab notes edit` rewrite for periodic consolidation.>
```

Update **What's been tried** every ~5 iterations or when a meaningful insight lands — `lab notes append` for the new line, with an occasional full rewrite when the section grows long. Cheap insurance against context resets.

---

## `/autoresearch run` — the loop

The agent loops autonomously. Never ask "should I continue?" — keep going until the user interrupts. One iteration:

0. **Rehydrate.** Don't trust your in-context memory of the session — it drifts and gets compacted away. At the **start of every iteration**, re-read:
   - The session plan: `lab notes show --raw` (Objective, Files in scope, Off limits, Constraints, Backlog, What's been tried, Max iterations). This is the canonical source — never skip it, never assume the prior iteration's recollection is current.
   - The current best + last few runs: `lab --format json job list --score-metric "<primary>" --score-order asc | jq '.[:10]'` (use `desc` if higher is better)
   - For surprising recent results, the relevant run's description: `lab --format json job info <id> | jq '.description, .job_data.score'`

   This is cheap (a few CLI calls) and is the difference between a coherent 100-iteration session and one that loses the plot at iteration 30.

1. **Pick the next idea.** Read the experiment notes (Backlog + What's been tried) and recent results. Prefer simple structural changes over random hyperparameter jiggling. If stuck, re-read the task code and the best/worst job's logs.
2. **Edit task code or compose param overrides.** For one-off changes, prefer `lab task edit <id> --from-file ./task.yaml --no-interactive` or per-queue `--param key=value`. Use `lab task upload` for new files. Don't mutate `task.yaml` mid-flight if jobs are queued — race-prone.
3. **Sweep the stale-job timeout** (see `Stale-job timeout` in the experiment notes). Any running job past the timeout is stopped — `minutes_requested` in `task.yaml` is *guidance*, not enforcement, so the agent has to actually kill stragglers itself or they'll consume the parallelism budget forever.
   ```bash
   NOW=$(date +%s)
   STALE_SECS=$(( <minutes> * 60 ))
   lab --format json job list --running | \
     jq -r --argjson now "$NOW" --argjson stale "$STALE_SECS" \
        '.[] | select((.created_at | fromdateiso8601) < ($now - $stale)) | .id' | \
     xargs -r -I {} lab job stop {}
   ```
4. **Respect the parallelism budget** before queuing:
   ```bash
   RUNNING=$(lab --format json job list --running | jq 'length')
   # If RUNNING >= N, do not queue more this iteration.
   ```
5. **Queue.** Always include `-m/--description` with a short, specific note (see "Run descriptions" below).
   ```bash
   lab task queue <TASK_ID> --no-interactive \
     --param lr=3e-5 --param warmup_steps=500 \
     -m "Bumped lr 1e-5→3e-5, warmup 100→500. Testing whether higher lr clears the eval/loss=2.1 plateau seen in baseline."
   ```
6. **Advance.** What this means depends on parallelism:
   - **N = 1 (sequential):** wait for the just-queued job to finish, then go to step 7. Poll with `lab --format json job list --running`.
   - **N ≥ 2 (parallel / fire-and-advance):** **do not wait.** Return to step 0 and pick the next idea immediately, until `RUNNING >= N`. Only block when the queue is full. This is what enables grid-style search; waiting after every queue collapses parallelism back to 1.
7. **Score → keep or discard** any *completed* jobs whose results haven't been processed yet. In parallel mode, this means scanning recently-finished jobs at the start of each cycle, not just the one you queued last.
   ```bash
   # Find COMPLETE jobs we haven't acted on yet (no discard flag set, not the current best).
   lab --format json job list | jq -r '.[] | select(.status=="COMPLETE") | .id'

   # For each: pull the score and compare to current best.
   lab --format json job info <JOB_ID> | jq '.job_data.score'

   # If FAILED: leave it. FAILED jobs are naturally excluded from "best" — no action needed.
   # If COMPLETE but primary metric did NOT improve over current best → lab job discard <JOB_ID>.
   # If COMPLETE and improved → leave kept. Jobs are kept by default.
   ```
8. **Loop.**

The agent stops the loop only when:
- The user interrupts or asks to stop the loop.
- **Max iterations reached.** If the experiment notes declare a max, count `lab --format json job list | jq 'length'` against it (excluding the baseline) and stop when the cap is hit. Report the cap, the best result, and ask whether to extend.
- The Backlog is exhausted **and** no new ideas surface after deep re-reading of the task and recent jobs. In that case, write a final summary to **What's been tried** and report.

### Picking the next idea

- **Primary metric is king.** Improvement → keep. Equal/worse → discard.
- **Simpler is better.** Removing code at equal perf → keep.
- **Don't thrash.** Reverting the same idea twice means try something structurally different.
- **Annotate failures heavily in the run description.** Discarded jobs don't lose their description — `lab job info <id>` will surface it forever. Write what was tried and *why it failed*; future iterations will skip the dead end.
- **Crashes:** check `lab job machine-logs <id>`. Trivial fix → fix and re-queue. Otherwise log and move on.

---

## Hyperparameter sweeps

When the user asks to "try a sweep across these params" or the loop hits a pure-hyperparameter idea, **prefer a Transformer Lab sweep** over manually queuing N jobs. Sweeps are first-class and run as a single coordinated job that fans out internally — better dashboards, single description, single artifact bundle.

Edit the task's `task.yaml` to add a `sweeps:` block, then re-apply with `lab task edit`:

```yaml
parameters:
  learning_rate: 1e-5
  batch_size: 32
sweeps:
  sweep_config:
    learning_rate: ["1e-5", "3e-5", "1e-4"]
    batch_size: ["16", "32", "64"]
  sweep_metric: "eval/loss"      # MUST match the primary metric in the experiment notes
  lower_is_better: true           # MUST match the direction
```

```bash
lab task edit <TASK_ID> --from-file ./task.yaml --no-interactive
lab task queue <TASK_ID> --no-interactive \
  -m "Sweep lr × batch_size to find the (lr, bs) cell that minimizes eval/loss. Hypothesis: optimal lr scales sub-linearly with bs."
```

Use the agent-driven loop (queue many `lab task queue --param ...` jobs) only for ideas that are **not pure hyperparameter combinations** — e.g. swapping the optimizer, adding a scheduler, restructuring the model. The rule of thumb: if the only thing changing is values inside `parameters:`, use a sweep.

After a sweep job completes, the per-cell results are inside the parent job's artifacts; surface the winning cell using the same ranked list the agent uses everywhere else (see "Show me status" below).

---

## During-session operations

Once the loop is running, the user will ask for things in plain language. None of these need a dedicated subcommand — the agent runs the right `lab` call from the parent skill and (where useful) synthesizes a short summary on top.

### "Show me status" / "where are we"

```bash
# Ranked by primary metric, best first (use --score-order desc if higher is better).
lab --format json job list --score-metric "<primary>" --score-order asc | \
  jq -r '.[] | select(.discarded != true)
         | [.id, .status, (.job_data.score // {} | tostring), .description]
         | @tsv' | head -20
```

Then synthesize 5–10 lines: **Baseline** (the `-m "Baseline …"` run) value, **best non-discarded** run + % improvement vs baseline, **kept vs discarded** counts, **currently running** count (`lab --format json job list --running | jq 'length'`), **top 3 backlog ideas** from the experiment notes (`lab notes show --raw`).

### "Keep job X" / "discard job X"

```bash
lab job discard <JOB_ID>          # discard
lab job discard <JOB_ID> --undo   # keep (un-discard)
```

Discarded jobs stay in `lab job list` (description, score, logs preserved) but are excluded from the "best" calculation. The loop already auto-discards any non-baseline run that doesn't beat the current best — explicit user requests usually mean *override* that auto-decision. **Never** `lab job delete` a job; discarding is reversible and preserves the audit trail.

### "Add an idea: …" / "remember to try …"

Append a Backlog bullet to the experiment notes:

```bash
lab notes append "- <text>"
```

`append` adds a newline before the new line and writes server-side, so multiple agents (or a fresh session) see it immediately. Lead with today's date if the idea is time-sensitive (`"- 2026-05-05: try Lion optimizer"`).

Also do this proactively whenever a promising idea surfaces during the loop but isn't being pursued right now — don't wait to be asked.

### "Stop everything" / "kill the running jobs"

```bash
lab --format json job list --running | jq -r '.[].id' | xargs -r -I {} lab job stop {}
```

Confirm with the user before stopping more than 3 jobs at once. Distinct from the loop's stale-job sweep (which kills only jobs past the configured timeout) — this stops *all* running jobs, on demand.

### "Stop the loop" / "exit autoresearch"

There is no daemon — the loop only runs while this conversation is active. When the user asks to stop, just stop iterating. The experiment, jobs, and experiment notes are untouched. To resume later: `lab experiment set-default <session-experiment-id>`, then `lab notes show --raw` + `lab job list --score-metric <primary>` to rehydrate, then `/autoresearch run`.

---

## `/autoresearch finalize`

End-of-session. The agent:

1. Identifies the best non-discarded run via `lab job list --score-metric <primary>` (see "Show me status" above for the exact incantation).
2. Updates **What's been tried** in the experiment notes with a final summary: best result, key wins, dead ends, leftover Backlog. Use `lab notes append` for the summary line; if the section needs restructuring, do a full rewrite via `EDITOR=tee lab notes edit < /tmp/new_notes.md > /dev/null` (see the "Reading and writing the plan" section at the top).
3. Asks the user whether to publish:
   ```bash
   lab --format json job publish model <BEST_JOB_ID> <MODEL_NAME> \
     --group "<group>" --mode new --tag latest \
     --description "Best of autoresearch session: <metric>=<value> (<delta>% vs baseline)."
   ```
   (or `lab job publish dataset` for dataset-producing tasks).
4. Reports the experiment ID so the user can re-enter via `lab experiment set-default`.

Do **not** delete the experiment. Do **not** delete jobs. The session record is the deliverable.

---

## Run descriptions are the durable record

Because Transformer Lab persists per-job descriptions, **`-m/--description` carries everything pi-autoresearch put in `autoresearch.jsonl`**. Treat each description as a mini commit message for that iteration:

1. **What changed vs the prior best run** (params, code, infra). If nothing changed, say so.
2. **What hypothesis is being tested** (why this run is worth doing).
3. **What to remember** if this fails — gotchas, prior surprises, dead-end markers.

```bash
printf '%s' "- Switched optimizer AdamW→Lion (β1=0.95, β2=0.98).
- Hypothesis: Lion's signed updates should help on this small batch size (32) where AdamW's 2nd moment estimate is noisy.
- If diverges in <500 steps, abandon Lion entirely — already saw similar collapse in job 7f21." | \
  lab task queue <TASK_ID> --no-interactive --param optimizer=lion -m -
```

Bad descriptions (`"train model"`, `"another run"`) defeat the entire point — the agent two iterations from now has no idea what was tried.

---

## Loop discipline (cribbed from pi-autoresearch, adapted)

- **Never stop the loop unless the user interrupts.** The user expects autonomous work.
- **One iteration per running job slot.** Don't queue past the parallelism budget.
- **Annotate failures heavily** via `-m`. Discarded ≠ deleted, and the description survives.
- **Keep the experiment notes honest.** Update **What's been tried** every ~5 runs via `lab notes append`. Re-read with `lab notes show --raw` at the start of every iteration — never skip the rehydrate.
- **Respect provider capacity.** Local providers serialize anyway; SkyPilot/RunPod cost real money — never raise parallelism without explicit user approval.
- **No `curl` workarounds.** If something seems missing from the CLI, run `lab <cmd> --help`, re-read this file, and tell the user — don't fall back to the REST API. (See the parent skill's "Do NOT call the REST API as a CLI workaround" section.)

---

## What this skill does NOT do

| pi-autoresearch feature | Why it's not here |
|---|---|
| `autoresearch.jsonl` (per-run log file) | Replaced by job descriptions + `lab job list --score-metric`. |
| `autoresearch.md` (local plan file) | Replaced by experiment notes (`lab notes`). The plan lives on the experiment record itself; any agent that joins the experiment rehydrates with `lab notes show --raw`. |
| `autoresearch.sh` benchmark script | Replaced by the task itself: the task computes the metric and calls `lab.finish(score=…)`. |
| `autoresearch.checks.sh` (correctness gating) | The task should fail (`lab.error(…)`) on correctness violations. The job ends `FAILED`, not `COMPLETE`, and is naturally excluded from "best". |
| `autoresearch.hooks/` (before/after) | Not yet — possible future addition. For now, agent-side logic in `/autoresearch run` is sufficient. |
| Live widget / dashboard | Use the Transformer Lab web UI's job view, or `lab job list --score-metric <primary>`. |
| Auto-commit on `keep` | Not applicable — task code lives on the server, not in a local git repo. The job record itself is the commit. |
| Confidence scoring (MAD-based noise floor) | Possible future addition. For now, suggest re-queuing a suspicious-looking improvement once before keeping it. |
