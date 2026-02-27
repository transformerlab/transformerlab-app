import React, { useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveRadar } from '@nivo/radar';
import { Select, Option, FormControl, Box, Button } from '@mui/joy';
import { ArrowLeftRight } from 'lucide-react';

export interface ChartMetric {
  type: string;
  score: number;
  evaluator?: string;
  job_id?: string | number;
  series?: string;
}

interface ChartProps {
  metrics: ChartMetric[];
  compareChart?: boolean;
}

const Chart = ({ metrics, compareChart = false }: ChartProps) => {
  const [chartType, setChartType] = useState('bar');
  const [swapAxes, setSwapAxes] = useState(false);
  const [barMode, setBarMode] = useState<'grouped' | 'stacked'>('grouped');

  const handleChartTypeChange = (
    _event: React.SyntheticEvent | null,
    newValue: string | null,
  ) => {
    if (newValue) setChartType(newValue);
  };

  const handleSwapAxes = () => {
    setSwapAxes(!swapAxes);
  };

  if (!metrics || metrics.length === 0) {
    return <div>No metrics available</div>;
  }

  // Normalize data structure regardless of compare mode
  // Get all unique metric types and series keys
  const metricTypes = Array.from(new Set(metrics.map((m) => m.type)));
  const seriesKeys = Array.from(
    new Set(
      metrics.map((m) =>
        compareChart ? `${m.evaluator}-${m.job_id}` : (m.series ?? 'score'),
      ),
    ),
  );

  // Create a consistent structure for all modes
  interface DataPoint {
    metric: string;
    [key: string]: string | number | undefined;
  }
  const dataMap: Record<string, DataPoint> = {};
  metrics.forEach((metric) => {
    const { type, evaluator, job_id, score, series } = metric;
    const seriesKey = compareChart
      ? `${evaluator}-${job_id}`
      : (series ?? 'score');

    if (!dataMap[type]) {
      dataMap[type] = { metric: type };
    }
    dataMap[type][seriesKey] = score;
  });

  const normalizedData = {
    dataPoints: Object.values(dataMap),
    metricTypes,
    seriesKeys,
  };

  // Get transformed data for the right chart type
  const getChartData = () => {
    const { dataPoints, metricTypes, seriesKeys } = normalizedData;

    if (chartType === 'line') {
      if (swapAxes) {
        // Series are metric types
        return metricTypes.map((type) => ({
          id: type,
          data: seriesKeys
            .map((seriesKey) => {
              const matchingPoint = dataPoints.find(
                (p) => p.metric === type && p[seriesKey] !== undefined,
              );
              return {
                x: seriesKey,
                y: matchingPoint ? (matchingPoint[seriesKey] as number) : null,
              };
            })
            .filter((point) => point.y !== null),
        }));
      } else {
        // Series are evaluators/jobs
        return seriesKeys.map((seriesKey) => ({
          id: seriesKey,
          data: dataPoints
            .map((point) => ({
              x: point.metric,
              y: point[seriesKey] as number,
            }))
            .filter((point) => point.y !== undefined),
        }));
      }
    } else if (chartType === 'bar' || chartType === 'radar') {
      if (chartType === 'radar') {
        if (swapAxes) {
          // Swap axes for radar: series keys become radar axes, metric types become keys
          return seriesKeys.map((seriesKey) => {
            const point: DataPoint = { metric: seriesKey };
            metricTypes.forEach((type) => {
              const base = dataMap[type]?.[seriesKey];
              point[type] = typeof base === 'number' ? base : 0;
            });
            return point;
          });
        }
        // For radar charts, replace undefined values with 0
        return dataPoints.map((point) => {
          const cleanedPoint: DataPoint = { ...point };
          // Ensure all series keys have valid numeric values
          seriesKeys.forEach((key) => {
            if (cleanedPoint[key] === undefined) {
              cleanedPoint[key] = 0;
            }
          });
          return cleanedPoint;
        });
      }
      // For bar charts, allow swapping axes by transposing
      if (swapAxes) {
        return seriesKeys.map((seriesKey) => {
          const point: DataPoint = { metric: seriesKey };
          metricTypes.forEach((type) => {
            const base = dataMap[type]?.[seriesKey];
            point[type] = typeof base === 'number' ? base : 0;
          });
          return point;
        });
      }
      return dataPoints;
    } else {
      return [];
    }
  };

  return (
    <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 8, p: 2 }}>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 2,
          alignItems: 'center',
        }}
      >
        <FormControl sx={{ width: 200 }}>
          <Select value={chartType} onChange={handleChartTypeChange}>
            <Option value="bar">Bar</Option>
            <Option value="line">Line</Option>
            <Option value="radar">Radar</Option>
          </Select>
        </FormControl>

        {(chartType === 'line' || chartType === 'bar') && (
          <Button
            variant="outlined"
            startDecorator={<ArrowLeftRight size={18} />}
            onClick={handleSwapAxes}
          >
            Swap Axes
          </Button>
        )}

        {chartType === 'bar' && seriesKeys.length > 1 && (
          <FormControl sx={{ width: 200 }}>
            <Select
              value={barMode}
              onChange={(_, v) => {
                if (v === 'grouped' || v === 'stacked') setBarMode(v);
              }}
            >
              <Option value="grouped">Grouped bars</Option>
              <Option value="stacked">Stacked bars</Option>
            </Select>
          </FormControl>
        )}
      </Box>

      <div style={{ height: 400, width: '100%' }}>
        {chartType === 'line' && (
          <ResponsiveLine
            data={
              getChartData() as {
                id: string;
                data: { x: string; y: number }[];
              }[]
            }
            margin={{ top: 50, right: 200, bottom: 80, left: 60 }}
            xScale={{ type: 'point' }}
            yScale={{
              type: 'linear',
              min: 'auto',
              max: 'auto',
              stacked: false,
              reverse: false,
            }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: swapAxes ? 45 : 0,
              legend: swapAxes ? 'experiment' : 'metric',
              legendOffset: 36,
              legendPosition: 'middle',
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'score',
              legendOffset: -40,
              legendPosition: 'middle',
            }}
            pointSize={10}
            pointColor={{ theme: 'background' }}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            legends={[
              {
                anchor: 'top-right',
                direction: 'column',
                justify: false,
                translateX: 100,
                translateY: 0,
                itemsSpacing: 0,
                itemDirection: 'left-to-right',
                itemWidth: 80,
                itemHeight: 20,
                itemOpacity: 0.75,
                symbolSize: 12,
                symbolShape: 'circle',
                symbolBorderColor: 'rgba(0, 0, 0, .5)',
              },
            ]}
          />
        )}

        {chartType === 'bar' && (
          <ResponsiveBar
            data={getChartData() as Record<string, string | number>[]}
            keys={
              swapAxes ? normalizedData.metricTypes : normalizedData.seriesKeys
            }
            indexBy="metric"
            margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
            padding={0.3}
            groupMode={barMode}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: swapAxes ? 'series' : 'metric',
              legendPosition: 'middle',
              legendOffset: 32,
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'score',
              legendPosition: 'middle',
              legendOffset: -40,
            }}
            colors={{ scheme: 'nivo' }}
            colorBy="id"
            animate={false}
          />
        )}

        {chartType === 'radar' && (
          <ResponsiveRadar
            data={getChartData() as DataPoint[]}
            keys={
              swapAxes ? normalizedData.metricTypes : normalizedData.seriesKeys
            }
            indexBy="metric"
            margin={{ top: 70, right: 170, bottom: 40, left: 80 }}
            borderColor={{ from: 'color' }}
            gridShape="circular"
            gridLabelOffset={36}
            dotSize={10}
            dotColor={{ theme: 'background' }}
            dotBorderWidth={2}
            colors={{ scheme: 'nivo' }}
            fillOpacity={0.25}
            blendMode="multiply"
            animate={true}
            motionConfig="wobbly"
            enableDotLabel={true}
            dotLabel="value"
            dotLabelYOffset={-12}
            legends={
              normalizedData.seriesKeys.length > 0
                ? [
                    {
                      anchor: 'top-right',
                      direction: 'column',
                      translateX: -200,
                      translateY: 0,
                      itemWidth: 120,
                      itemHeight: 20,
                      itemTextColor: '#999',
                      symbolSize: 12,
                      symbolShape: 'circle',
                      effects: [
                        {
                          on: 'hover',
                          style: {
                            itemTextColor: '#000',
                          },
                        },
                      ],
                    },
                  ]
                : []
            }
          />
        )}
      </div>
    </Box>
  );
};

export default Chart;
