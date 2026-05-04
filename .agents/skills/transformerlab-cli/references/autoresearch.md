# `/autoresearch` — Autonomous Experiment Loop

Autonomous optimization loop that runs as a workflow on top of the `lab` CLI: pick an idea, queue it as a job, score it, keep what works, discard what doesn't, repeat. Inspired by [`pi-autoresearch`](https://github.com/davebcn87/pi-autoresearch) but adapted to Transformer Lab — there is no extension, no `autoresearch.jsonl`, and no separate widget. Everything is stored on the **experiment** and on each **job** record:

- **Experiment** = the autoresearch session. One experiment per session.
- **Job description** (`-m/--description`) = what was attempted in that iteration.
- **Job score** (`lab.finish(score={...})`) = primary + secondary metrics, set by the task itself.
- **Job discard flag** (`lab job discard <id>` / `--undo`) = keep vs reject.
- **`lab job list --score-metric <name>`** = the ranked dashboard.
- **`autoresearch.md`** = the only file the workflow writes — durable session notes for context resets.

## When to use

Trigger on requests like:

- "run autoresearch on …", "optimize X in a loop", "set up an autoresearch experiment for …"
- explicit `/autoresearch …` slash-style invocations the user types

## Subcommands

| Subcommand | Purpose |
|---|---|
| `/autoresearch init <goal>` | Set up a new session: create experiment, scaffold task + `autoresearch.md`, queue baseline. |
| `/autoresearch run` | Enter the loop: pick next idea, queue up to N parallel jobs, score, keep/discard, repeat. |
| `/autoresearch sweep <key=v1,v2,…>` | Add a `sweeps:` block to the task and launch a parallel hyperparameter sweep. |
| `/autoresearch status` | Print ranked job list for the current session, with best vs baseline summary. |
| `/autoresearch keep <job_id>` | Mark a job as kept (`lab job discard <id> --undo`). |
| `/autoresearch discard <job_id>` | Mark a job as discarded (`lab job discard <id>`). |
| `/autoresearch idea <text>` | Append to the **Backlog** section of `autoresearch.md`. |
| `/autoresearch finalize` | Summarize best run, update `autoresearch.md`, offer to publish model/dataset. |
| `/autoresearch stop` | Stop all running jobs in the current autoresearch experiment. |
| `/autoresearch off` | Exit loop mode. Experiment, jobs, and `autoresearch.md` are preserved. |

The workflow is **agent-driven** — these are not real `lab` subcommands. Each one expands into a sequence of `lab` calls described below. Always use `lab --no-interactive`, never `--yes`/`-y`.

---

## `/autoresearch init <goal>`

One-time setup. Five things to gather (ask only what you can't infer from context):

1. **Goal** — what is being optimized, in plain language.
2. **Primary metric** — name (e.g. `eval/loss`), unit, direction (`lower` / `higher` is better).
3. **Secondary metrics** — names only; tradeoff monitors that don't gate keep/discard.
4. **Task** — either an existing task ID, or a workload to scaffold via `lab task init`.
5. **Parallelism** — max concurrent jobs (default `1`; ask before going higher because each running job consumes provider capacity).

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

# 3. Write autoresearch.md (template below). Keep it close to the task code.

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

### `autoresearch.md` template

This is the **only file** the workflow writes. A fresh agent (after a context reset, restart, or `/autoresearch run` resume) reads `autoresearch.md` + `lab job list --score-metric <primary>` and continues exactly where the prior session stopped.

```markdown
# Autoresearch: <goal>

**Experiment:** `autoresearch-<slug>-<date>`
**Primary metric:** `<name>` — <unit>, <lower|higher> is better
**Secondary metrics:** `<name>`, `<name>`, ...
**Task:** `<task_id>`
**Parallelism:** <N>

## Objective
<One paragraph: what's being optimized and the workload behind the metric.>

## How a run is scored
The task calls `lab.finish(score={"<primary>": value, ...})`. Use
`lab job list --score-metric <primary>` to rank.

## Files in scope
<Files the agent may modify between iterations.>

## Off limits
<Files / tasks / providers that must not be touched.>

## Constraints
<Hard rules: tests must pass, no new deps, no GPU > X, etc.>

## Backlog
<Promising ideas not yet tried. Use `/autoresearch idea <text>` to append.>

## What's been tried
<Updated periodically by the agent. One bullet per cluster of related runs:
the hypothesis, the result, what was learned. Discarded runs lose their code
on revert — this section is the only durable record of dead ends.>
```

Update **What's been tried** every ~5 iterations or when a meaningful insight lands. Cheap insurance against context resets.

---

## `/autoresearch run` — the loop

The agent loops autonomously. Never ask "should I continue?" — keep going until the user interrupts or `/autoresearch off`. One iteration:

1. **Pick the next idea.** Read `autoresearch.md` (Backlog + What's been tried) and recent results. Prefer simple structural changes over random hyperparameter jiggling. If stuck, re-read the task code and the best/worst job's logs.
2. **Edit task code or compose param overrides.** For one-off changes, prefer `lab task edit <id> --from-file ./task.yaml --no-interactive` or per-queue `--param key=value`. Use `lab task upload` for new files. Don't mutate `task.yaml` mid-flight if jobs are queued — race-prone.
3. **Respect the parallelism budget** before queuing:
   ```bash
   RUNNING=$(lab --format json job list --running | jq 'length')
   # If RUNNING >= N, wait — don't queue more.
   ```
4. **Queue.** Always include `-m/--description` with a short, specific note (see "Run descriptions" below).
   ```bash
   lab task queue <TASK_ID> --no-interactive \
     --param lr=3e-5 --param warmup_steps=500 \
     -m "Bumped lr 1e-5→3e-5, warmup 100→500. Testing whether higher lr clears the eval/loss=2.1 plateau seen in baseline."
   ```
5. **Wait for completion** of at least one running job before re-entering step 1, so the loop doesn't fire-and-forget. Poll with `lab --format json job list --running`.
6. **Score → keep or discard.**
   ```bash
   # Pull the score for the just-completed job
   lab --format json job info <JOB_ID> | jq '.job_data.score'

   # If primary metric did NOT improve over current best → discard.
   lab job discard <JOB_ID>
   # If it did improve, leave it as-is (no action needed; jobs are kept by default).
   ```
7. **Loop.**

The agent stops the loop only when:
- The user interrupts.
- `/autoresearch off` is invoked.
- The Backlog is exhausted **and** no new ideas surface after deep re-reading of the task and recent jobs. In that case, write a final summary to **What's been tried** and report.

### Picking the next idea

- **Primary metric is king.** Improvement → keep. Equal/worse → discard.
- **Simpler is better.** Removing code at equal perf → keep.
- **Don't thrash.** Reverting the same idea twice means try something structurally different.
- **Annotate failures heavily in the run description.** Discarded jobs don't lose their description — `lab job info <id>` will surface it forever. Write what was tried and *why it failed*; future iterations will skip the dead end.
- **Crashes:** check `lab job machine-logs <id>`. Trivial fix → fix and re-queue. Otherwise log and move on.

---

## `/autoresearch sweep <key=v1,v2,…> [<key=v1,v2,…> …]`

When testing hyperparameters in parallel, **prefer a Transformer Lab sweep** over manually queuing N jobs. Sweeps are first-class and run as a single coordinated job that fans out internally — better dashboards, single description, single artifact bundle.

Edit the task's `task.yaml` to add a `sweeps:` block, then re-apply with `lab task edit`:

```yaml
parameters:
  learning_rate: 1e-5
  batch_size: 32
sweeps:
  sweep_config:
    learning_rate: ["1e-5", "3e-5", "1e-4"]
    batch_size: ["16", "32", "64"]
  sweep_metric: "eval/loss"      # MUST match the primary metric in autoresearch.md
  lower_is_better: true           # MUST match the direction
```

```bash
lab task edit <TASK_ID> --from-file ./task.yaml --no-interactive
lab task queue <TASK_ID> --no-interactive \
  -m "Sweep lr × batch_size to find the (lr, bs) cell that minimizes eval/loss. Hypothesis: optimal lr scales sub-linearly with bs."
```

Use the agent-driven loop (queue many `lab task queue --param ...` jobs) only for ideas that are **not pure hyperparameter combinations** — e.g. swapping the optimizer, adding a scheduler, restructuring the model. The rule of thumb: if the only thing changing is values inside `parameters:`, use a sweep.

After a sweep job completes, the per-cell results are inside the parent job's artifacts; surface the winning cell with `/autoresearch status`.

---

## `/autoresearch status`

```bash
# Ranked by primary metric, best first.
lab --format json job list --score-metric "<primary>" --score-order asc | \
  jq -r '.[] | select(.discarded != true)
         | [.id, .status, (.job_data.score // {} | tostring), .description]
         | @tsv' | head -20
```

Then synthesize a 5–10 line summary covering:

- **Baseline** (the run with `-m "Baseline …"`): metric value.
- **Best non-discarded** run: ID, metric, % improvement vs baseline.
- **Total runs**: kept vs discarded.
- **Currently running**: count from `lab --format json job list --running | jq 'length'`.
- **Top 3 ideas in backlog** (from `autoresearch.md`).

---

## `/autoresearch keep <job_id>` / `/autoresearch discard <job_id>`

```bash
lab job discard <JOB_ID>          # mark as discarded
lab job discard <JOB_ID> --undo   # un-discard (= keep)
```

Discarded jobs stay in `lab job list` but are excluded from the "best" calculation. They are **not deleted** — their description, score, and logs are preserved as a record of what failed.

By convention, the agent auto-discards any non-baseline run whose primary metric is equal-or-worse than the current best. Don't delete jobs (`lab job delete`) — discarding is reversible and preserves the audit trail.

---

## `/autoresearch idea <text>`

Append to the **Backlog** section of `autoresearch.md`:

```bash
printf '\n- %s\n' "<text>" >> autoresearch.md
```

The agent should also do this proactively whenever a non-trivial idea surfaces during the loop but isn't being pursued right now.

---

## `/autoresearch finalize`

End-of-session. The agent:

1. Runs `/autoresearch status` to identify the best non-discarded run.
2. Updates **What's been tried** in `autoresearch.md` with a final summary: best result, key wins, dead ends, leftover Backlog.
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

## `/autoresearch stop`

Stop all running jobs in the current autoresearch experiment:

```bash
lab --format json job list --running | \
  jq -r '.[].id' | \
  xargs -I {} lab job stop {}
```

Confirms with the user before stopping more than 3 jobs at once.

---

## `/autoresearch off`

Just exits the loop in this conversation — there is no daemon. The experiment, jobs, and `autoresearch.md` are untouched. To resume later: `lab experiment set-default <session-experiment-id>`, re-read `autoresearch.md` + `lab job list --score-metric <primary>`, then `/autoresearch run`.

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
- **Keep `autoresearch.md` honest.** Update **What's been tried** every ~5 runs.
- **Respect provider capacity.** Local providers serialize anyway; SkyPilot/RunPod cost real money — never raise parallelism without explicit user approval.
- **No `curl` workarounds.** If something seems missing from the CLI, run `lab <cmd> --help`, re-read this file, and tell the user — don't fall back to the REST API. (See the parent skill's "Do NOT call the REST API as a CLI workaround" section.)

---

## What this skill does NOT do

| pi-autoresearch feature | Why it's not here |
|---|---|
| `autoresearch.jsonl` (per-run log file) | Replaced by job descriptions + `lab job list --score-metric`. |
| `autoresearch.sh` benchmark script | Replaced by the task itself: the task computes the metric and calls `lab.finish(score=…)`. |
| `autoresearch.checks.sh` (correctness gating) | The task should fail (`lab.error(…)`) on correctness violations. The job ends `FAILED`, not `COMPLETE`, and is naturally excluded from "best". |
| `autoresearch.hooks/` (before/after) | Not yet — possible future addition. For now, agent-side logic in `/autoresearch run` is sufficient. |
| Live widget / dashboard | Use the Transformer Lab web UI's job view, or `lab job list --score-metric <primary>`. |
| Auto-commit on `keep` | Not applicable — task code lives on the server, not in a local git repo. The job record itself is the commit. |
| Confidence scoring (MAD-based noise floor) | Possible future addition. For now, suggest re-queuing a suspicious-looking improvement once before keeping it. |
