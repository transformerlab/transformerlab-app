# Quota Tracking and Enforcement Implementation Plan

## Overview

This document outlines the plan for implementing quota tracking and enforcement for tasks launched from the Tasks tab. The system will allow team owners to set monthly quotas for teams and override per-user, while users can see their quota usage and remaining quota.

## Key Requirements

1. **Team-level quotas**: Team owners can set monthly quota (minutes) for their team
2. **User-level overrides**: Team owners can increase quota for specific users
3. **Quota display**: Users can see their remaining and used quota
4. **Requested minutes**: Users specify minutes when creating a task
5. **Quota hold**: Minutes are temporarily held when task is queued
6. **Actual usage tracking**: Actual minutes used are calculated when job completes (only for REMOTE type jobs)
7. **Enforcement**: Prevent launching jobs if quota is insufficient

## Database Schema

### 1. `team_quotas` table
Stores team-level monthly quota configuration.

```sql
CREATE TABLE team_quotas (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    monthly_quota_minutes INTEGER NOT NULL DEFAULT 0,
    current_period_start DATE NOT NULL,  -- Start of current billing/period month
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id)
);
```

**Purpose**: Stores the monthly quota allocation for each team. The `current_period_start` tracks when the current quota period started (for monthly reset).

### 2. `user_quota_overrides` table
Stores per-user quota overrides (additional minutes beyond team quota).

```sql
CREATE TABLE user_quota_overrides (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    monthly_quota_minutes INTEGER NOT NULL DEFAULT 0,  -- Additional minutes beyond team quota
    current_period_start DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, team_id)
);
```

**Purpose**: Allows team owners to give specific users additional quota beyond the team default.

### 3. `quota_usage` table
Tracks actual quota usage from completed jobs.

```sql
CREATE TABLE quota_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    job_id TEXT NOT NULL,  -- References job ID from filesystem
    experiment_id TEXT NOT NULL,
    minutes_used REAL NOT NULL,  -- Actual minutes used (from start_time to end_time)
    period_start DATE NOT NULL,  -- Which quota period this usage belongs to
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_team_period (user_id, team_id, period_start),
    INDEX idx_job_id (job_id)
);
```

**Purpose**: Records actual minutes consumed from completed REMOTE jobs. This is the source of truth for "used quota".

### 4. `quota_holds` table
Tracks temporarily held quota when tasks are queued but not yet running.

```sql
CREATE TABLE quota_holds (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    task_id TEXT NOT NULL,  -- Task that requested the quota
    job_id TEXT,  -- Job ID (may be null if not yet created)
    minutes_requested INTEGER NOT NULL,  -- Minutes requested for this task
    status TEXT NOT NULL,  -- 'HELD', 'RELEASED', 'CONVERTED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP,
    INDEX idx_user_team_status (user_id, team_id, status),
    INDEX idx_task_id (task_id),
    INDEX idx_job_id (job_id)
);
```

**Purpose**: Temporarily holds quota when a task is queued. Status transitions:
- `HELD`: Quota is currently held
- `RELEASED`: Quota was released (task cancelled before running)
- `CONVERTED`: Quota hold was converted to actual usage (job started)

## Data Flow

### 1. Task Creation with Minutes Requested

**Frontend**: User creates a task and specifies `minutes_requested` in task config.

**Backend**: Task is stored with `minutes_requested` in config (if not present, default to some value or reject).

### 2. Queueing a Task (Quota Hold)

When user clicks "Queue" or "Launch" for a remote task:

1. **Check available quota**: 
   - Calculate: `total_quota = team_quota + user_override_quota`
   - Calculate: `used_quota = SUM(quota_usage.minutes_used WHERE user_id AND period_start = current_period)`
   - Calculate: `held_quota = SUM(quota_holds.minutes_requested WHERE user_id AND status = 'HELD')`
   - Calculate: `available_quota = total_quota - used_quota - held_quota`

2. **Validate**: If `minutes_requested > available_quota`, reject with error message

3. **Create quota hold**: Insert into `quota_holds` with status `HELD`

4. **Proceed with launch**: Create job and launch

### 3. Job Completion (Quota Usage Recording)

When a REMOTE job transitions to COMPLETE, STOPPED, FAILED, or DELETED:

1. **Check if quota should be counted**:
   - Verify job type is REMOTE
   - Check if job was in LAUNCHING, RUNNING, or INTERACTIVE state (if `start_time` exists, job entered LAUNCHING)
   
2. **Calculate actual minutes**: 
   - Get `start_time` from job_data
   - Get end time: `end_time`, `stop_time`, or current time (depending on final status)
   - Calculate: `actual_minutes = (end_time - start_time) / 60`

3. **Record usage**:
   - Insert into `quota_usage` with actual_minutes
   - Update corresponding `quota_hold` status to `CONVERTED` (if exists)
   - If actual usage was less than requested, we keep the record for audit but status is CONVERTED

4. **If job never entered LAUNCHING state** (no start_time or failed before launch):
   - Release quota hold (status = RELEASED)
   - Do not record quota usage

### 4. Job Cancellation/Failure/Deletion (Quota Hold Release)

#### Case 1: Job Deleted in LAUNCHING State
If a job is deleted while in LAUNCHING state:

1. Calculate actual minutes from `start_time` to deletion time (or use current time if no end_time)
2. Record usage in `quota_usage` table with actual minutes
3. Update corresponding `quota_hold` status to `CONVERTED`
4. **Record quota usage for LAUNCHING duration** (job was using resources during launch)

#### Case 2: Job STOPPED
If a job is STOPPED from LAUNCHING, RUNNING, or INTERACTIVE state:

1. Calculate actual minutes from `start_time` to `stop_time` (when STOPPED was triggered)
2. Record usage in `quota_usage` table with actual minutes
3. Update corresponding `quota_hold` status to `CONVERTED`
4. **Count quota for actual duration** (whether in LAUNCHING, RUNNING, or INTERACTIVE state)

**Key point**: REMOTE jobs are tracked if they were in LAUNCHING, RUNNING, or INTERACTIVE state before being stopped.

#### Case 3: Job COMPLETE
If a job completes successfully from LAUNCHING, RUNNING, or INTERACTIVE state:

1. Calculate actual minutes from `start_time` to `end_time`
2. Record usage in `quota_usage` table with actual minutes
3. Update corresponding `quota_hold` status to `CONVERTED`
4. **Count quota for actual duration** (includes LAUNCHING, RUNNING, and INTERACTIVE states)

#### Case 4: Job FAILED
If a job fails:

1. Check if job was in LAUNCHING, RUNNING, or INTERACTIVE state before failing
2. If yes: Calculate actual minutes from `start_time` to failure time, record quota usage
3. If no (failed immediately before LAUNCHING): Release quota hold, don't count quota
4. Update corresponding `quota_hold` status accordingly (CONVERTED if quota counted, RELEASED if not)

**Key principle**: For REMOTE jobs, count quota if job entered LAUNCHING, RUNNING, or INTERACTIVE state (indicated by presence of `start_time`). Quota is counted for LAUNCHING state as resources are allocated during cluster launch. If job never enters LAUNCHING state (no start_time), release the hold.

## API Endpoints

### Quota Management (Team Owners)

```
GET /api/quota/team/{team_id}
- Get team quota configuration and current usage summary

PATCH /api/quota/team/{team_id}
- Update team monthly quota
- Body: { monthly_quota_minutes: int }

GET /api/quota/team/{team_id}/users
- Get quota usage by all users in team

PATCH /api/quota/user/{user_id}/team/{team_id}
- Set/update user quota override
- Body: { monthly_quota_minutes: int }  -- Additional minutes beyond team quota
```

### Quota Display (Users)

```
GET /api/quota/me
- Get current user's quota status
- Returns: {
    team_quota: int,
    user_override: int,
    total_quota: int,
    used_quota: float,
    held_quota: int,
    available_quota: float,
    period_start: date,
    period_end: date
  }

GET /api/quota/me/usage
- Get detailed usage history for current user
- Returns: list of quota_usage records
```

### Quota Enforcement (Internal)

```
POST /api/quota/check
- Internal endpoint to check if user has enough quota
- Body: { user_id: str, team_id: str, minutes_requested: int }
- Returns: { has_quota: bool, available_quota: float, message: str }
```

## Implementation Details

### Quota Period Management

- Quota periods are monthly, starting on the 1st of each month
- `current_period_start` tracks the start of the current period
- When checking quota, compare `period_start` dates
- Usage is recorded with the period it belongs to

### Job Completion Tracking

**Important**: We only track quota for REMOTE type jobs. REMOTE jobs can be in these states:
- `LAUNCHING`: Job is being launched (count quota)
- `RUNNING`: Job is actively running (count quota)
- `INTERACTIVE`: Job is in interactive mode (count quota)
- `COMPLETE`: Job finished successfully
- `STOPPED`: Job was stopped
- `FAILED`: Job failed
- `DELETED`: Job was deleted

REMOTE jobs are never in `QUEUED` state (only local jobs use QUEUED).

The SDK's `lab.finish()` method and provider job status checking already set `end_time`. We need to:

1. Add a hook in `job_update_status` or `check_provider_job_status` when status changes to:
   - `COMPLETE`: Job finished successfully
     - Check if job type is REMOTE
     - Calculate actual minutes from start_time to end_time
     - Record in quota_usage, mark quota_hold as CONVERTED
   - `STOPPED`: Job was manually stopped
     - Check if job type is REMOTE
     - Check if job was in LAUNCHING, RUNNING, or INTERACTIVE state before being stopped
     - Calculate actual minutes from start_time to stop_time, record quota usage
     - Mark quota_hold as CONVERTED
   - `FAILED`: Job failed
     - Check if job type is REMOTE
     - Check if job was in LAUNCHING, RUNNING, or INTERACTIVE state before failing
     - If yes: Calculate actual minutes from start_time to failure time, record quota usage
     - If no (failed immediately): Release quota hold, don't count quota
   - `DELETED`: Job was deleted
     - Check if job type is REMOTE
     - Check if job was in LAUNCHING, RUNNING, or INTERACTIVE state before deletion
     - If yes: Calculate actual minutes from start_time to deletion time, record quota usage
     - If no (deleted before LAUNCHING): Release quota hold, don't count quota

2. **Key logic**: For REMOTE jobs, count quota if job was ever in LAUNCHING, RUNNING, or INTERACTIVE state
   - All REMOTE jobs go through LAUNCHING state when started
   - If job has start_time, it means it entered LAUNCHING state
   - Count quota from start_time to end_time/stop_time/deletion_time regardless of final state
3. Get user_id from job_data.user_info or from request context
4. Record in quota_usage table if job was in one of the tracked states (LAUNCHING/RUNNING/INTERACTIVE), otherwise release quota_hold

**Implementation note**: For REMOTE jobs, if `start_time` exists, the job entered LAUNCHING state and should count towards quota. We count quota for LAUNCHING state as well since resources are being used during cluster launch.

### Minutes Requested in Tasks

- Add `minutes_requested` field to task config (optional, with default)
- Frontend should prompt user for minutes when creating/editing remote tasks
- Validate minutes_requested is positive integer

### Quota Hold Lifecycle

1. **Created**: When REMOTE task is launched (creates quota hold)
2. **CONVERTED**: When REMOTE job enters LAUNCHING state (has start_time) and quota usage is recorded
3. **RELEASED**: When job fails before entering LAUNCHING state (no start_time) - quota hold released

### Edge Cases

1. **Job runs longer than requested**: We record actual usage, not requested. User may exceed quota but it's tracked.
2. **Job runs shorter than requested**: We record actual usage. Excess hold is released when job completes.
3. **Multiple tasks queued simultaneously**: Each gets its own quota_hold record
4. **Task deleted before launch**: Release the quota hold (status = RELEASED)
5. **REMOTE jobs only**: Only REMOTE type jobs count towards quota. Other job types (TRAIN, EVAL, etc.) don't use quota.
6. **REMOTE job states**: REMOTE jobs can be in LAUNCHING, RUNNING, INTERACTIVE, COMPLETE, STOPPED, FAILED, or DELETED states. Never QUEUED.
7. **LAUNCHING state counts**: Quota is counted for time spent in LAUNCHING state (cluster launch time) as resources are allocated.
8. **INTERACTIVE state counts**: Quota is counted for INTERACTIVE jobs (e.g., VS Code sessions) if they transition to STOPPED/COMPLETE.
5. **Job deleted in LAUNCHING state**: Count quota for LAUNCHING duration (start_time to deletion time)
6. **Job stopped from LAUNCHING/RUNNING/INTERACTIVE**: Count quota for actual duration (start_time to stop_time)
7. **Job failed after entering LAUNCHING**: Count quota for duration from start_time to failure time
8. **Job failed before LAUNCHING (no start_time)**: Release quota hold, do NOT count any quota usage
9. **Monthly reset**: Quota resets on 1st of month. Old usage records remain for history but don't count against new period.
10. **Determining if job counts towards quota**: 
   - **For REMOTE jobs**: Count quota if job entered LAUNCHING, RUNNING, or INTERACTIVE state
   - Job deleted/stopped in LAUNCHING state: Count quota for LAUNCHING duration
   - Job in RUNNING state: Count quota for runtime duration
   - Job in INTERACTIVE state: Count quota for interactive session duration
   - If job has `start_time`, it entered LAUNCHING state and should count towards quota
11. **Status tracking**: Track if job was in LAUNCHING, RUNNING, or INTERACTIVE state by checking job status and start_time. All REMOTE jobs with start_time should count quota.

## Migration Strategy

1. Create migration for new tables (no foreign keys, as per project standards)
2. Start fresh - no backfilling of historical quota usage
3. Set default team quotas (e.g., 0 or some reasonable default)
4. Deploy API endpoints
5. Update frontend to show quota and request minutes
6. Enable enforcement gradually (could start with warnings, then enforce)

## Future Enhancements

- Quota alerts/warnings at certain thresholds (e.g., 80% used)
- Quota history/analytics
- Quota sharing between team members
- Different quota types (training vs inference vs storage)
- Quota rollover (unused minutes carry over)

