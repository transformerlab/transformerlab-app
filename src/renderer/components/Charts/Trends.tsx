import { useEffect, useMemo, useRef, useState } from 'react';
import IconButton from '@mui/joy/IconButton';
import Tooltip from '@mui/joy/Tooltip';
import { Maximize2, Minimize2 } from 'lucide-react';
import Box from '@mui/joy/Box';
import Checkbox from '@mui/joy/Checkbox';
import Chip from '@mui/joy/Chip';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Slider from '@mui/joy/Slider';
import Stack from '@mui/joy/Stack';
import ToggleButtonGroup from '@mui/joy/ToggleButtonGroup';
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import { ResponsiveLine, Serie } from '@nivo/line';
import { linearRegression } from './linearRegression';
import { emaSmooth } from './smoothing';

export interface TrendPoint {
  series: string;
  xTime?: number;
  xIndex: number;
  y: number;
  label?: string;
  discarded?: boolean;
}

export interface TrendsProps {
  points: TrendPoint[];
  xAxis: {
    initialMode: 'time' | 'index';
    allowToggle?: boolean;
    timeLabel?: string;
    indexLabel?: string;
  };
  yAxisLabel?: string;
  availableSeries?: string[];
  defaultSelectedSeries?: string[];
  showTrendlineDefault?: boolean;
  smoothingDefault?: number; // 0..0.99
  title?: string;
  height?: number;
}

type XMode = 'time' | 'index';
type TimeRange = '1D' | '1W' | '1M' | '6M' | '1Y' | '5Y' | 'ALL';

const RANGE_OPTIONS: { value: TimeRange; label: string; ms: number | null }[] =
  [
    { value: '1D', label: '1D', ms: 24 * 60 * 60 * 1000 },
    { value: '1W', label: '1W', ms: 7 * 24 * 60 * 60 * 1000 },
    { value: '1M', label: '1M', ms: 30 * 24 * 60 * 60 * 1000 },
    { value: '6M', label: '6M', ms: 182 * 24 * 60 * 60 * 1000 },
    { value: '1Y', label: '1Y', ms: 365 * 24 * 60 * 60 * 1000 },
    { value: '5Y', label: '5Y', ms: 5 * 365 * 24 * 60 * 60 * 1000 },
    { value: 'ALL', label: 'Max', ms: null },
  ];

const PALETTE = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
];

const baseSeriesName = (id: string): string =>
  id.replace(/ \((raw|trend)\)$/, '');

const fadeHex = (hex: string, alpha: number): string => {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function Trends({
  points,
  xAxis,
  yAxisLabel = 'Value',
  availableSeries,
  defaultSelectedSeries,
  showTrendlineDefault = false,
  smoothingDefault = 0,
  title,
  height = 560,
}: TrendsProps) {
  const allSeries = useMemo(() => {
    if (availableSeries && availableSeries.length > 0) return availableSeries;
    const set = new Set<string>();
    for (const p of points) set.add(p.series);
    return Array.from(set).sort();
  }, [availableSeries, points]);

  const initialSelected = useMemo(() => {
    if (defaultSelectedSeries && defaultSelectedSeries.length > 0) {
      return defaultSelectedSeries.filter((s) => allSeries.includes(s));
    }
    return allSeries.slice(0, Math.min(2, allSeries.length));
  }, [defaultSelectedSeries, allSeries]);

  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [xMode, setXMode] = useState<XMode>(xAxis.initialMode);
  const [showTrendline, setShowTrendline] =
    useState<boolean>(showTrendlineDefault);
  const [smoothing, setSmoothing] = useState<number>(
    Math.min(Math.max(smoothingDefault, 0), 0.99),
  );
  const [includeDiscarded, setIncludeDiscarded] = useState<boolean>(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL');

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  const hasDiscarded = useMemo(
    () => points.some((p) => p.discarded === true),
    [points],
  );

  const timeCapablePointCount = useMemo(
    () => points.filter((p) => typeof p.xTime === 'number').length,
    [points],
  );
  const timeToggleEnabled =
    (xAxis.allowToggle ?? false) && timeCapablePointCount >= 2;

  const effectiveMode: XMode =
    xMode === 'time' && !timeToggleEnabled && xAxis.initialMode !== 'time'
      ? 'index'
      : xMode;

  const getX = (p: TrendPoint): number | null => {
    if (effectiveMode === 'time') {
      return typeof p.xTime === 'number' ? p.xTime : null;
    }
    return p.xIndex;
  };

  const timeRangeBounds = useMemo<{ min: number; max: number } | null>(() => {
    if (effectiveMode !== 'time') return null;
    let latest = -Infinity;
    for (const p of points) {
      if (typeof p.xTime === 'number' && p.xTime > latest) latest = p.xTime;
    }
    if (!Number.isFinite(latest)) return null;
    const opt = RANGE_OPTIONS.find((r) => r.value === timeRange);
    if (!opt || opt.ms == null) return null;
    return { min: latest - opt.ms, max: latest };
  }, [effectiveMode, points, timeRange]);

  const dataSeries: Serie[] = useMemo(() => {
    const grouped = new Map<
      string,
      { x: number; y: number; label?: string }[]
    >();
    for (const p of points) {
      if (!selected.includes(p.series)) continue;
      if (p.discarded && !includeDiscarded) continue;
      const x = getX(p);
      if (x === null || !Number.isFinite(p.y)) continue;
      if (
        timeRangeBounds &&
        (x < timeRangeBounds.min || x > timeRangeBounds.max)
      )
        continue;
      const arr = grouped.get(p.series) ?? [];
      arr.push({ x, y: p.y, label: p.label });
      grouped.set(p.series, arr);
    }

    const out: Serie[] = [];
    for (const [series, pts] of grouped.entries()) {
      pts.sort((a, b) => a.x - b.x);

      if (smoothing > 0) {
        const smoothed = emaSmooth(
          pts.map(({ x, y }) => ({ x, y })),
          smoothing,
        );
        out.push({
          id: `${series} (raw)`,
          data: pts.map(({ x, y, label }) => ({ x, y, label })),
        });
        out.push({
          id: series,
          data: smoothed.map(({ x, y }, i) => ({
            x,
            y,
            label: pts[i]?.label,
          })),
        });
      } else {
        out.push({
          id: series,
          data: pts.map(({ x, y, label }) => ({ x, y, label })),
        });
      }

      if (!showTrendline) continue;
      const fit = linearRegression(pts);
      if (!fit) continue;
      const xMin = pts[0].x;
      const xMax = pts[pts.length - 1].x;
      out.push({
        id: `${series} (trend)`,
        data: [
          { x: xMin, y: fit.intercept + fit.slope * xMin },
          { x: xMax, y: fit.intercept + fit.slope * xMax },
        ],
      });
    }
    return out;
  }, [
    points,
    selected,
    effectiveMode,
    showTrendline,
    smoothing,
    includeDiscarded,
    timeRangeBounds,
  ]);

  const xLabel =
    effectiveMode === 'time'
      ? (xAxis.timeLabel ?? 'Time')
      : (xAxis.indexLabel ?? 'Run #');

  const toNumber = (value: number | string | Date): number => {
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    return Number(value);
  };

  const formatX = (value: number | string | Date): string => {
    const n = toNumber(value);
    if (!Number.isFinite(n)) return String(value);
    if (effectiveMode === 'time') {
      return new Date(n).toLocaleString();
    }
    return String(n);
  };

  const formatXAxisTick = (value: number | string | Date): string => {
    const n = toNumber(value);
    if (!Number.isFinite(n)) return String(value);
    if (effectiveMode !== 'time') return String(n);
    const d = new Date(n);
    if (timeRange === '1D') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (timeRange === '5Y' || timeRange === 'ALL') {
      return d.toLocaleDateString([], { month: 'short', year: 'numeric' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: isFullscreen ? '100vh' : 'auto',
        bgcolor: isFullscreen ? 'background.body' : 'transparent',
        p: isFullscreen ? 2 : 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        {title ? <Typography level="title-md">{title}</Typography> : <span />}
        <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          <IconButton
            variant="plain"
            size="sm"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, flexWrap: 'wrap' }}
        useFlexGap
      >
        <FormControl sx={{ minWidth: 240 }}>
          <FormLabel>Metrics</FormLabel>
          <Select
            multiple
            value={selected}
            onChange={(_, value) => setSelected((value as string[]) ?? [])}
            renderValue={(opts) => (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {opts.map((o) => (
                  <Chip key={o.value as string} size="sm">
                    {o.label}
                  </Chip>
                ))}
              </Box>
            )}
          >
            {allSeries.map((s) => (
              <Option key={s} value={s}>
                {s}
              </Option>
            ))}
          </Select>
        </FormControl>

        {xAxis.allowToggle && (
          <FormControl>
            <FormLabel>X-axis</FormLabel>
            <ToggleButtonGroup
              value={effectiveMode}
              onChange={(_, value) => {
                if (value === 'time' || value === 'index') setXMode(value);
              }}
            >
              <Button value="index">{xAxis.indexLabel ?? 'Run #'}</Button>
              <Button value="time" disabled={!timeToggleEnabled}>
                {xAxis.timeLabel ?? 'Time'}
              </Button>
            </ToggleButtonGroup>
          </FormControl>
        )}

        {effectiveMode === 'time' && (
          <FormControl>
            <FormLabel>Range</FormLabel>
            <ToggleButtonGroup
              value={timeRange}
              onChange={(_, value) => {
                if (value) setTimeRange(value as TimeRange);
              }}
            >
              {RANGE_OPTIONS.map((opt) => (
                <Button key={opt.value} value={opt.value}>
                  {opt.label}
                </Button>
              ))}
            </ToggleButtonGroup>
          </FormControl>
        )}

        <FormControl>
          <FormLabel>&nbsp;</FormLabel>
          <Stack spacing={0.5}>
            <Checkbox
              label="Show trendline"
              checked={showTrendline}
              onChange={(e) => setShowTrendline(e.target.checked)}
            />
            {hasDiscarded && (
              <Checkbox
                label="Include discarded runs"
                checked={includeDiscarded}
                onChange={(e) => setIncludeDiscarded(e.target.checked)}
              />
            )}
          </Stack>
        </FormControl>

        <FormControl sx={{ minWidth: 200 }}>
          <FormLabel>
            Smoothing
            {smoothing > 0 ? ` (${smoothing.toFixed(2)})` : ''}
          </FormLabel>
          <Slider
            value={smoothing}
            onChange={(_, value) =>
              setSmoothing(Array.isArray(value) ? value[0] : value)
            }
            min={0}
            max={0.99}
            step={0.01}
            valueLabelDisplay="auto"
          />
        </FormControl>
      </Stack>

      <Box sx={isFullscreen ? { flex: 1, minHeight: 0 } : { height }}>
        {dataSeries.length === 0 ? (
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            No data to display. Select one or more metrics.
          </Typography>
        ) : (
          <ResponsiveLine
            data={dataSeries}
            margin={{ top: 24, right: 140, bottom: 72, left: 64 }}
            xScale={
              timeRangeBounds
                ? {
                    type: 'linear',
                    min: timeRangeBounds.min,
                    max: timeRangeBounds.max,
                  }
                : { type: 'linear' }
            }
            yScale={{ type: 'linear', stacked: false }}
            axisBottom={{
              legend: xLabel,
              legendOffset: 56,
              legendPosition: 'middle',
              format: formatXAxisTick,
              tickRotation: effectiveMode === 'time' ? -30 : 0,
            }}
            axisLeft={{
              legend: yAxisLabel,
              legendOffset: -48,
              legendPosition: 'middle',
            }}
            colors={(d: any) => {
              const id = String(d?.id ?? '');
              const base = baseSeriesName(id);
              const idx = allSeries.indexOf(base);
              const hex = PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
              if (id.endsWith(' (raw)')) return fadeHex(hex, 0.25);
              if (id.endsWith(' (trend)')) return fadeHex(hex, 0.7);
              return hex;
            }}
            pointSize={
              ((d: any) => {
                const id = String(d?.serieId ?? '');
                if (id.endsWith(' (raw)') || id.endsWith(' (trend)')) return 0;
                return 6;
              }) as unknown as number
            }
            useMesh
            enableSlices={false}
            lineWidth={
              ((d: any) => {
                const id = String(d?.id ?? '');
                if (id.endsWith(' (raw)')) return 1;
                if (id.endsWith(' (trend)')) return 1.5;
                return 2;
              }) as unknown as number
            }
            theme={{
              crosshair: { line: { strokeOpacity: 0.4 } },
            }}
            legends={[
              {
                anchor: 'bottom-right',
                direction: 'column',
                translateX: 130,
                itemWidth: 120,
                itemHeight: 18,
                symbolShape: 'circle',
              },
            ]}
            tooltip={({ point }) => {
              const label = (point.data as any).label as string | undefined;
              return (
                <Box
                  sx={{
                    bgcolor: 'background.surface',
                    border: '1px solid',
                    borderColor: 'divider',
                    p: 1,
                    borderRadius: 'sm',
                  }}
                >
                  <Typography level="body-sm" fontWeight="lg">
                    {String(point.serieId)}
                  </Typography>
                  {label && (
                    <Typography level="body-xs">Job: {label}</Typography>
                  )}
                  <Typography level="body-xs">
                    {xLabel}: {formatX(point.data.x as number)}
                  </Typography>
                  <Typography level="body-xs">
                    {yAxisLabel}: {String(point.data.y)}
                  </Typography>
                </Box>
              );
            }}
          />
        )}
      </Box>
    </Box>
  );
}
