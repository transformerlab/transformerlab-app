import { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/joy';
import { ResponsiveLine } from '@nivo/line';
import { Link as RouterLink } from 'react-router-dom';
import { ChartPoint, ChartPointKind, GraphModel } from './JobsChartShared';

interface HoveredPointData {
  jobId?: string;
  description?: string;
  kind?: ChartPointKind;
  isBest?: boolean;
  metricLabel?: string;
  statusNote?: string;
  xFormatted?: string | number;
  yFormatted?: string | number;
}

interface JobsChartGraphViewProps {
  model: GraphModel;
  onClose?: () => void;
  experimentId?: string | null;
  presentation?: 'default' | 'public';
}

const BEST_COLOR = '#22c55e';
const BEST_BORDER = '#15803d';
const POINT_COLOR = '#3b82f6';
const DISCARD_POINT_FILL = '#94a3b8';
const DISCARD_POINT_STROKE = '#64748b';

const PUBLIC_SHARE_NIVO_THEME = {
  axis: {
    ticks: {
      text: { fill: '#475569', fontSize: 11 },
      line: { stroke: '#cbd5e1' },
    },
    legend: {
      text: { fill: '#475569', fontSize: 12 },
    },
  },
  grid: {
    line: {
      stroke: '#e2e8f0',
      strokeWidth: 1,
    },
  },
  crosshair: {
    line: {
      stroke: '#94a3b8',
      strokeOpacity: 0.75,
    },
  },
};

function BestStepLine({
  bestForStepLine,
  xScale,
  yScale,
}: {
  bestForStepLine: ChartPoint[];
  xScale: (v: Date) => number;
  yScale: (v: number) => number;
}) {
  if (bestForStepLine.length < 2) return null;
  const pts = bestForStepLine.map((p) => ({
    x: xScale(p.x),
    y: yScale(p.y),
  }));
  const path = pts
    .slice(1)
    .reduce(
      (acc, point, index) =>
        `${acc} L ${point.x},${pts[index].y} L ${point.x},${point.y}`,
      `M ${pts[0].x},${pts[0].y}`,
    );
  return <path d={path} stroke={BEST_COLOR} strokeWidth={2} fill="none" />;
}

function CustomPoints({
  series,
  xScale,
  yScale,
}: {
  series: { data?: { data: Record<string, unknown> }[] }[];
  xScale: (v: Date) => number;
  yScale: (v: number) => number;
}) {
  return (
    <g>
      {series[0]?.data?.map((d: { data: Record<string, unknown> }) => {
        const row = d.data;
        const kind = row.kind as ChartPointKind;
        const isBest = kind === 'scored' && !!row.isBest;
        const cx = xScale(row.x as Date);
        const cy = yScale(row.y as number);
        const key = `pt-${String(row.jobId)}-${String(row.x)}`;
        if (kind === 'discarded') {
          return (
            <circle
              key={key}
              cx={cx}
              cy={cy}
              r={5}
              fill={DISCARD_POINT_FILL}
              stroke={DISCARD_POINT_STROKE}
              strokeWidth={1.5}
            />
          );
        }
        return (
          <circle
            key={key}
            cx={cx}
            cy={cy}
            r={isBest ? 5 : 4}
            fill={isBest ? BEST_COLOR : POINT_COLOR}
            stroke={isBest ? BEST_BORDER : 'none'}
            strokeWidth={0}
          />
        );
      })}
    </g>
  );
}

function renderPointDetails(
  data: HoveredPointData,
  link?: { to: string; onClick: () => void },
) {
  const jobId = data.jobId ?? '';
  const shortId = jobId ? jobId.slice(0, 8) : '';
  const desc = data.description?.trim();
  const idEl =
    link && shortId ? (
      <RouterLink
        to={link.to}
        onClick={link.onClick}
        style={{ color: 'inherit', textDecoration: 'underline' }}
      >
        <b>{shortId}</b>
      </RouterLink>
    ) : (
      <b>{shortId}</b>
    );
  return (
    <Box sx={{ fontSize: 12 }}>
      <div>{idEl}</div>
      <div>
        {data.metricLabel ?? 'score'}: {String(data.yFormatted ?? '')}
      </div>
      <div style={{ marginTop: 4, opacity: 0.85 }}>
        {String(data.xFormatted ?? '')}
      </div>
      {desc ? (
        <Typography
          level="body-xs"
          sx={{ mt: 0.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {desc}
        </Typography>
      ) : (
        <Typography
          level="body-xs"
          sx={{ mt: 0.75, fontStyle: 'italic', color: 'text.tertiary' }}
        >
          No description
        </Typography>
      )}
    </Box>
  );
}

export default function JobsChartGraphView({
  model,
  onClose,
  experimentId,
  presentation = 'default',
}: JobsChartGraphViewProps) {
  const isPublic = presentation === 'public';
  const panelBg = isPublic ? 'common.white' : 'background.surface';
  const chartPanelSx = isPublic
    ? {
        bgcolor: 'common.white',
        borderColor: 'neutral.300',
      }
    : {};
  const [hoveredPointData, setHoveredPointData] =
    useState<HoveredPointData | null>(null);
  const chartData = useMemo(
    () => [
      {
        id: 'jobs',
        data: model.points.map((p: ChartPoint) => ({
          x: p.x,
          y: p.y,
          jobId: p.jobId,
          description: p.description,
          kind: p.kind,
          isBest: p.isBest,
          metricLabel: p.metricLabel,
          statusNote: p.statusNote,
        })),
      },
    ],
    [model.points],
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 2 }}>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          border: '1px solid',
          borderColor: 'neutral.outlinedBorder',
          borderRadius: 'sm',
          ...chartPanelSx,
        }}
      >
        <ResponsiveLine
          data={chartData}
          theme={isPublic ? PUBLIC_SHARE_NIVO_THEME : undefined}
          margin={{ top: 24, right: 32, bottom: 64, left: 64 }}
          xScale={{ type: 'time', precision: 'minute' }}
          xFormat="time:%Y-%m-%d %H:%M"
          yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
          axisBottom={{
            format: '%b %d %H:%M',
            tickRotation: -30,
            legend: 'Date',
            legendOffset: 50,
            legendPosition: 'middle',
          }}
          axisLeft={{
            legend: model.axisLegend,
            legendOffset: -48,
            legendPosition: 'middle',
          }}
          enableGridX={false}
          enableGridY
          colors={[POINT_COLOR]}
          lineWidth={0}
          enablePoints={false}
          layers={[
            'grid',
            'axes',
            (layerProps: any) => (
              <BestStepLine
                bestForStepLine={model.bestForStepLine}
                xScale={layerProps.xScale}
                yScale={layerProps.yScale}
              />
            ),
            (layerProps: any) => (
              <CustomPoints
                series={layerProps.series}
                xScale={layerProps.xScale}
                yScale={layerProps.yScale}
              />
            ),
            'mesh',
            'crosshair',
          ]}
          useMesh
          onMouseMove={(point) =>
            setHoveredPointData(point?.data as HoveredPointData)
          }
          tooltip={() => null}
        />
      </Box>
      <Box
        sx={{
          width: 300,
          flexShrink: 0,
          border: '1px solid',
          borderColor: 'neutral.outlinedBorder',
          borderRadius: 'sm',
          p: 2,
          overflow: 'auto',
          bgcolor: panelBg,
          ...(isPublic ? { borderColor: 'neutral.300' } : {}),
        }}
      >
        {hoveredPointData ? (
          renderPointDetails(
            hoveredPointData,
            hoveredPointData.jobId && experimentId && onClose
              ? {
                  to: `/experiment/${experimentId}/jobs/${hoveredPointData.jobId}`,
                  onClick: onClose,
                }
              : undefined,
          )
        ) : (
          <Typography
            level="body-sm"
            sx={{ color: 'text.tertiary', fontStyle: 'italic' }}
          >
            Hover a point to see job details.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
