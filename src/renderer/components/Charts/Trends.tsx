import { useMemo, useState } from 'react';
import Box from '@mui/joy/Box';
import Checkbox from '@mui/joy/Checkbox';
import Chip from '@mui/joy/Chip';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Stack from '@mui/joy/Stack';
import ToggleButtonGroup from '@mui/joy/ToggleButtonGroup';
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import { ResponsiveLine, Serie } from '@nivo/line';
import { linearRegression } from './linearRegression';

export interface TrendPoint {
  series: string;
  xTime?: number;
  xIndex: number;
  y: number;
  label?: string;
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
  title?: string;
  height?: number;
}

type XMode = 'time' | 'index';

export default function Trends({
  points,
  xAxis,
  yAxisLabel = 'Value',
  availableSeries,
  defaultSelectedSeries,
  showTrendlineDefault = false,
  title,
  height = 420,
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

  const dataSeries: Serie[] = useMemo(() => {
    const grouped = new Map<
      string,
      { x: number; y: number; label?: string }[]
    >();
    for (const p of points) {
      if (!selected.includes(p.series)) continue;
      const x = getX(p);
      if (x === null || !Number.isFinite(p.y)) continue;
      const arr = grouped.get(p.series) ?? [];
      arr.push({ x, y: p.y, label: p.label });
      grouped.set(p.series, arr);
    }

    const out: Serie[] = [];
    for (const [series, pts] of grouped.entries()) {
      pts.sort((a, b) => a.x - b.x);
      out.push({
        id: series,
        data: pts.map(({ x, y, label }) => ({ x, y, label })),
      });

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
  }, [points, selected, effectiveMode, showTrendline]);

  const xLabel =
    effectiveMode === 'time'
      ? (xAxis.timeLabel ?? 'Time')
      : (xAxis.indexLabel ?? 'Run #');

  const formatX = (value: number | string | Date): string => {
    const n =
      typeof value === 'number'
        ? value
        : value instanceof Date
          ? value.getTime()
          : Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (effectiveMode === 'time') {
      return new Date(n).toLocaleString();
    }
    return String(n);
  };

  return (
    <Box>
      {title && (
        <Typography level="title-md" sx={{ mb: 1 }}>
          {title}
        </Typography>
      )}
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

        <FormControl>
          <FormLabel>&nbsp;</FormLabel>
          <Checkbox
            label="Show trendline"
            checked={showTrendline}
            onChange={(e) => setShowTrendline(e.target.checked)}
          />
        </FormControl>
      </Stack>

      <Box sx={{ height }}>
        {dataSeries.length === 0 ? (
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            No data to display. Select one or more metrics.
          </Typography>
        ) : (
          <ResponsiveLine
            data={dataSeries}
            margin={{ top: 24, right: 140, bottom: 56, left: 64 }}
            xScale={{ type: 'linear' }}
            yScale={{ type: 'linear', stacked: false }}
            axisBottom={{
              legend: xLabel,
              legendOffset: 40,
              legendPosition: 'middle',
              format: formatX,
            }}
            axisLeft={{
              legend: yAxisLabel,
              legendOffset: -48,
              legendPosition: 'middle',
            }}
            colors={{ scheme: 'category10' }}
            pointSize={6}
            useMesh
            enableSlices={false}
            lineWidth={2}
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
