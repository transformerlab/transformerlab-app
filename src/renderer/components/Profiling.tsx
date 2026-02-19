import { useEffect, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Stack,
  Table,
  Typography,
} from '@mui/joy';
import { RefreshCwIcon } from 'lucide-react';

import { fetchWithAuth, useAPI } from 'renderer/lib/authContext';

interface ProfilerInfo {
  id: string;
  name: string;
  vendor: string;
  category: string;
  command: string | null;
  available: boolean;
  run_supported: boolean;
  version: string;
  description: string;
}

interface ProfilersResponse {
  gpu_vendor: string;
  accelerator: string;
  gpu_available: boolean;
  profilers: ProfilerInfo[];
  installed_gpu_profilers: ProfilerInfo[];
  auto_profiling_enabled?: boolean;
  auto_selected_profiler?: string | null;
  auto_profile_reason?: string;
}

interface ProfilerRunState {
  run_id: string;
  profiler_id: string;
  status: string;
  command: string[];
  output_path: string;
  started_at: number;
  completed_at: number | null;
  last_lines: string[];
  source?: string;
  associated_job_id?: string | null;
}

interface ProfilerRunsResponse {
  runs: ProfilerRunState[];
}

interface TimelineEvent {
  id: string;
  label: string;
  start_ms: number;
  duration_ms: number;
}

interface TimelineLane {
  id: string;
  name: string;
  events: TimelineEvent[];
}

interface RunTimeline {
  source: string;
  unit: string;
  range_ms: number;
  lanes: TimelineLane[];
}

interface RunTimelineResponse {
  run_id: string;
  profiler_id: string;
  timeline: RunTimeline;
}

const PROFILERS_PAGE_SIZE = 6;
const RUNS_PAGE_SIZE = 10;
const TIMELINE_COLORS = [
  '#5AA9E6',
  '#F7A072',
  '#7FC8A9',
  '#F2C14E',
  '#E07A5F',
  '#81B29A',
  '#A29BFE',
  '#6EC5E9',
];

function getRunStatusColor(status: string) {
  if (status === 'running') return 'primary';
  if (status === 'completed') return 'success';
  if (status === 'stopped') return 'warning';
  return 'danger';
}

function formatTimestamp(timestampSeconds?: number | null) {
  if (!timestampSeconds) {
    return 'n/a';
  }
  return new Date(timestampSeconds * 1000).toLocaleString();
}

function formatCommand(commandParts?: string[]) {
  if (!Array.isArray(commandParts) || commandParts.length === 0) {
    return 'n/a';
  }
  return commandParts.join(' ');
}

function filterProfilersForVendor(
  profilers: ProfilerInfo[],
  gpuVendor?: string,
): ProfilerInfo[] {
  const normalizedVendor = (gpuVendor ?? '').toLowerCase();
  if (normalizedVendor !== 'nvidia' && normalizedVendor !== 'amd') {
    return profilers;
  }

  return profilers.filter((profiler) => {
    const profilerVendor = profiler.vendor.toLowerCase();
    return (
      profilerVendor === normalizedVendor || profilerVendor === 'cross-platform'
    );
  });
}

export default function Profiling() {
  const [selectedView, setSelectedView] = useState<'profilers' | 'runs'>(
    'profilers',
  );
  const [profilersPage, setProfilersPage] = useState<number>(1);
  const [runsPage, setRunsPage] = useState<number>(1);
  const [timelineRunId, setTimelineRunId] = useState<string | null>(null);
  const [timelineData, setTimelineData] = useState<RunTimeline | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [isTimelineLoading, setIsTimelineLoading] = useState<boolean>(false);

  const {
    data: profilerData,
    isLoading,
    error,
    mutate: mutateProfilers,
  } = useAPI('server', ['profilers'], {}, { refreshInterval: 15000 });

  const { data: profilerRunsData, mutate: mutateRuns } = useAPI(
    'server',
    ['profilerRuns'],
    { limit: 200 },
    { refreshInterval: 5000 },
  );

  const response = (profilerData ?? {}) as Partial<ProfilersResponse>;
  const runsResponse = (profilerRunsData ??
    {}) as Partial<ProfilerRunsResponse>;

  const profilers = Array.isArray(response.profilers) ? response.profilers : [];
  const visibleProfilers = filterProfilersForVendor(
    profilers,
    response.gpu_vendor,
  );
  const recentRuns = Array.isArray(runsResponse.runs) ? runsResponse.runs : [];
  const installedGpuProfilers = Array.isArray(response.installed_gpu_profilers)
    ? response.installed_gpu_profilers
    : [];

  const activeRun = recentRuns.find((run) => run.status === 'running') ?? null;
  const totalProfilerPages = Math.max(
    1,
    Math.ceil(visibleProfilers.length / PROFILERS_PAGE_SIZE),
  );
  const totalRunPages = Math.max(
    1,
    Math.ceil(recentRuns.length / RUNS_PAGE_SIZE),
  );

  useEffect(() => {
    setProfilersPage((current) => Math.min(current, totalProfilerPages));
  }, [totalProfilerPages]);

  useEffect(() => {
    setRunsPage((current) => Math.min(current, totalRunPages));
  }, [totalRunPages]);

  const pagedProfilers = visibleProfilers.slice(
    (profilersPage - 1) * PROFILERS_PAGE_SIZE,
    profilersPage * PROFILERS_PAGE_SIZE,
  );
  const pagedRuns = recentRuns.slice(
    (runsPage - 1) * RUNS_PAGE_SIZE,
    runsPage * RUNS_PAGE_SIZE,
  );
  const timelineRangeMs = Math.max(timelineData?.range_ms ?? 0, 0.001);
  const rulerTicks = Array.from({ length: 11 }, (_, index) => index);

  const loadTimeline = async (runId: string) => {
    setTimelineRunId(runId);
    setTimelineData(null);
    setTimelineError(null);
    setIsTimelineLoading(true);
    try {
      const timelineResponse = await fetchWithAuth(
        `server/profilers/runs/${runId}/timeline?max_lanes=12&max_events=2000`,
        { method: 'GET' },
      );
      const payload = (await timelineResponse.json()) as
        | RunTimelineResponse
        | { detail?: string };
      if (!timelineResponse.ok) {
        throw new Error(payload?.detail ?? 'Failed to load timeline.');
      }
      setTimelineData((payload as RunTimelineResponse).timeline);
    } catch (timelineFetchError: any) {
      setTimelineData(null);
      setTimelineError(
        timelineFetchError?.message ?? 'Failed to load timeline.',
      );
    } finally {
      setIsTimelineLoading(false);
    }
  };

  const closeTimelineView = () => {
    setTimelineRunId(null);
    setTimelineData(null);
    setTimelineError(null);
    setIsTimelineLoading(false);
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        overflow: 'hidden',
        pb: 1,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography level="h2">Profiling</Typography>
        <Button
          size="sm"
          variant="soft"
          startDecorator={<RefreshCwIcon size={14} />}
          onClick={() => {
            mutateProfilers();
            mutateRuns();
            if (timelineRunId) {
              loadTimeline(timelineRunId);
            }
          }}
        >
          Refresh
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Chip color={response.gpu_available ? 'success' : 'neutral'}>
          GPU: {response.gpu_available ? 'Detected' : 'Not detected'}
        </Chip>
        <Chip variant="soft">Vendor: {response.gpu_vendor ?? 'unknown'}</Chip>
        <Chip variant="soft">
          Installed GPU Profilers: {installedGpuProfilers.length}
        </Chip>
        <Chip
          color={response.auto_profiling_enabled ? 'success' : 'warning'}
          variant="soft"
        >
          Auto Profiling: {response.auto_profiling_enabled ? 'On' : 'Off'}
        </Chip>
        <Chip variant="soft">
          Selected Profiler: {response.auto_selected_profiler ?? 'none'}
        </Chip>
      </Stack>

      {!response.auto_profiling_enabled && response.auto_profile_reason && (
        <Alert color="warning">{response.auto_profile_reason}</Alert>
      )}

      <Stack direction="row" spacing={1}>
        <Button
          size="sm"
          variant={selectedView === 'profilers' ? 'solid' : 'soft'}
          onClick={() => setSelectedView('profilers')}
        >
          Compatible Profilers
        </Button>
        <Button
          size="sm"
          variant={selectedView === 'runs' ? 'solid' : 'soft'}
          onClick={() => setSelectedView('runs')}
        >
          Profiling Runs
        </Button>
      </Stack>

      {activeRun && (
        <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 'sm' }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography level="title-md">Active Profiling Run</Typography>
            <Chip size="sm" color={getRunStatusColor(activeRun.status)}>
              {activeRun.status}
            </Chip>
          </Stack>
          <Typography level="body-xs">Run ID: {activeRun.run_id}</Typography>
          <Typography level="body-xs">
            Command: {formatCommand(activeRun.command)}
          </Typography>
          <Typography level="body-xs">
            Output: {activeRun.output_path || 'n/a'}
          </Typography>
          <Typography level="body-xs">
            Started: {formatTimestamp(activeRun.started_at)}
          </Typography>
          <Box
            component="pre"
            sx={{
              mt: 1,
              mb: 0,
              p: 1,
              maxHeight: 180,
              overflow: 'auto',
              fontSize: 12,
              borderRadius: '6px',
              bgcolor: 'neutral.softBg',
              whiteSpace: 'pre-wrap',
            }}
          >
            {activeRun.last_lines?.length > 0
              ? activeRun.last_lines.join('\n')
              : 'No logs captured yet.'}
          </Box>
        </Sheet>
      )}

      {isLoading && profilers.length === 0 && (
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{ height: '100%', gap: 1 }}
        >
          <CircularProgress />
          <Typography level="body-sm">Detecting profilers...</Typography>
        </Stack>
      )}

      {error && (
        <Typography level="body-sm" color="danger">
          Failed to load profiling data.
        </Typography>
      )}

      {selectedView === 'profilers' && visibleProfilers.length > 0 && (
        <Box sx={{ overflow: 'auto', minHeight: 180 }}>
          <Typography level="title-sm" sx={{ mb: 1 }}>
            Compatible Profilers
          </Typography>
          <Table hoverRow stickyHeader size="sm">
            <thead>
              <tr>
                <th>Profiler</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>In-App Run</th>
                <th>Version</th>
                <th>Command</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {pagedProfilers.map((profiler) => (
                <tr key={profiler.id}>
                  <td>{profiler.name}</td>
                  <td>{profiler.vendor}</td>
                  <td>
                    <Chip
                      size="sm"
                      color={profiler.available ? 'success' : 'neutral'}
                    >
                      {profiler.available ? 'Installed' : 'Missing'}
                    </Chip>
                  </td>
                  <td>
                    <Chip
                      size="sm"
                      color={profiler.run_supported ? 'primary' : 'neutral'}
                    >
                      {profiler.run_supported ? 'Supported' : 'Read-only'}
                    </Chip>
                  </td>
                  <td>{profiler.version}</td>
                  <td>{profiler.command ?? 'built-in'}</td>
                  <td>{profiler.description}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Stack
            direction="row"
            spacing={1}
            justifyContent="space-between"
            alignItems="center"
            sx={{ mt: 1 }}
          >
            <Typography level="body-xs" color="neutral">
              Page {profilersPage} of {totalProfilerPages}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="sm"
                variant="outlined"
                disabled={profilersPage <= 1}
                onClick={() =>
                  setProfilersPage((page) => Math.max(1, page - 1))
                }
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outlined"
                disabled={profilersPage >= totalProfilerPages}
                onClick={() =>
                  setProfilersPage((page) =>
                    Math.min(totalProfilerPages, page + 1),
                  )
                }
              >
                Next
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}

      {selectedView === 'profilers' && visibleProfilers.length === 0 && (
        <Typography level="body-sm" color="neutral">
          No compatible profilers found for the detected accelerator vendor.
        </Typography>
      )}

      {selectedView === 'runs' && (
        <Box sx={{ overflow: 'auto', minHeight: 140 }}>
          <Typography level="title-sm" sx={{ mb: 1 }}>
            Recent Profiling Runs
          </Typography>
          {recentRuns.length === 0 ? (
            <Typography level="body-sm" color="neutral">
              No profiling runs yet.
            </Typography>
          ) : (
            <>
              <Table hoverRow size="sm">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Profiler</th>
                    <th>Source</th>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Output</th>
                    <th>Timeline</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRuns.map((run) => (
                    <tr key={run.run_id}>
                      <td>{run.run_id}</td>
                      <td>{run.profiler_id}</td>
                      <td>{run.source ?? 'auto'}</td>
                      <td>{run.associated_job_id ?? '-'}</td>
                      <td>
                        <Chip size="sm" color={getRunStatusColor(run.status)}>
                          {run.status}
                        </Chip>
                      </td>
                      <td>{formatTimestamp(run.started_at)}</td>
                      <td>{formatTimestamp(run.completed_at)}</td>
                      <td>{run.output_path || 'n/a'}</td>
                      <td>
                        <Button
                          size="sm"
                          variant={
                            timelineRunId === run.run_id ? 'solid' : 'outlined'
                          }
                          loading={
                            isTimelineLoading && timelineRunId === run.run_id
                          }
                          onClick={() => loadTimeline(run.run_id)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Stack
                direction="row"
                spacing={1}
                justifyContent="space-between"
                alignItems="center"
                sx={{ mt: 1 }}
              >
                <Typography level="body-xs" color="neutral">
                  Page {runsPage} of {totalRunPages}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="sm"
                    variant="outlined"
                    disabled={runsPage <= 1}
                    onClick={() => setRunsPage((page) => Math.max(1, page - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    disabled={runsPage >= totalRunPages}
                    onClick={() =>
                      setRunsPage((page) => Math.min(totalRunPages, page + 1))
                    }
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
        </Box>
      )}

      <Modal open={timelineRunId !== null} onClose={closeTimelineView}>
        <ModalDialog
          sx={{
            width: '85vw',
            height: '82vh',
            maxWidth: 'none',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ModalClose />
          <Typography level="title-lg" sx={{ mb: 1 }}>
            Timeline View{timelineData ? ` (${timelineData.source})` : ''} - Run{' '}
            {timelineRunId}
          </Typography>

          {isTimelineLoading && !timelineData && !timelineError && (
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{ flex: 1, minHeight: 0, gap: 1 }}
            >
              <CircularProgress />
              <Typography level="body-sm">Loading timeline...</Typography>
            </Stack>
          )}

          {timelineError && (
            <Alert color="warning" sx={{ mb: 1 }}>
              {timelineError}
            </Alert>
          )}

          {timelineData && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'neutral.outlinedBorder',
                borderRadius: '8px',
                overflow: 'auto',
                p: 1,
                bgcolor: 'background.body',
                flex: 1,
                minHeight: 0,
              }}
            >
              <Box sx={{ minWidth: 1200 }}>
                <Stack direction="row" sx={{ mb: 1 }}>
                  <Box sx={{ width: 260, flexShrink: 0 }} />
                  <Box
                    sx={{
                      position: 'relative',
                      flex: 1,
                      height: 24,
                      borderBottom: '1px solid',
                      borderColor: 'neutral.outlinedBorder',
                    }}
                  >
                    {rulerTicks.map((tick) => (
                      <Box
                        key={tick}
                        sx={{
                          position: 'absolute',
                          left: `${tick * 10}%`,
                          top: 0,
                          bottom: 0,
                          borderLeft: '1px dashed',
                          borderColor: 'neutral.outlinedBorder',
                          fontSize: 10,
                          color: 'text.tertiary',
                          pl: 0.5,
                        }}
                      >
                        {(timelineRangeMs * (tick / 10)).toFixed(2)} ms
                      </Box>
                    ))}
                  </Box>
                </Stack>

                <Stack spacing={0.75}>
                  {timelineData.lanes.map((lane, laneIndex) => (
                    <Stack direction="row" key={lane.id} alignItems="center">
                      <Typography
                        level="body-xs"
                        sx={{
                          width: 260,
                          flexShrink: 0,
                          pr: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={lane.name}
                      >
                        {lane.name}
                      </Typography>
                      <Box
                        sx={{
                          position: 'relative',
                          flex: 1,
                          height: 28,
                          border: '1px solid',
                          borderColor: 'neutral.outlinedBorder',
                          borderRadius: '4px',
                          bgcolor: 'neutral.softBg',
                          overflow: 'hidden',
                        }}
                      >
                        {lane.events.map((event) => {
                          const left = Math.max(
                            0,
                            Math.min(
                              100,
                              (event.start_ms / timelineRangeMs) * 100,
                            ),
                          );
                          const width = Math.max(
                            0.2,
                            (event.duration_ms / timelineRangeMs) * 100,
                          );
                          return (
                            <Box
                              key={event.id}
                              title={`${event.label || lane.name} | ${event.duration_ms.toFixed(3)} ms`}
                              sx={{
                                position: 'absolute',
                                left: `${left}%`,
                                width: `${width}%`,
                                top: 4,
                                bottom: 4,
                                borderRadius: '3px',
                                bgcolor:
                                  TIMELINE_COLORS[
                                    laneIndex % TIMELINE_COLORS.length
                                  ],
                                opacity: 0.88,
                                overflow: 'hidden',
                                px: 0.5,
                                fontSize: 10,
                                color: '#111827',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {event.label}
                            </Box>
                          );
                        })}
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            </Box>
          )}
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
