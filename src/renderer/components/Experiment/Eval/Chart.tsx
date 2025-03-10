import React, { useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveRadar } from '@nivo/radar';
import { Select, Option, FormControl, Box, Button } from '@mui/joy';
import { ArrowLeftRight } from 'lucide-react';

const Chart = ({ metrics, compareChart }) => {
  const [chartType, setChartType] = useState('bar');
  const [swapAxes, setSwapAxes] = useState(false);

  const handleChartTypeChange = (event, newValue) => {
    setChartType(newValue);
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
        compareChart ? `${m.evaluator}-${m.job_id}` : 'score',
      ),
    ),
  );

  // Create a consistent structure for all modes
  const dataMap = {};
  metrics.forEach((metric) => {
    const { type, evaluator, job_id, score } = metric;
    const seriesKey = compareChart ? `${evaluator}-${job_id}` : 'score';

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
                y: matchingPoint ? matchingPoint[seriesKey] : null,
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
              y: point[seriesKey],
            }))
            .filter((point) => point.y !== undefined),
        }));
      }
    } else if (chartType === 'bar' || chartType === 'radar') {
      if (chartType === 'radar') {
        // For radar charts, replace undefined values with 0
        return dataPoints.map(point => {
          const cleanedPoint = { ...point };
          // Ensure all series keys have valid numeric values
          seriesKeys.forEach(key => {
            if (cleanedPoint[key] === undefined) {
              cleanedPoint[key] = 0;
            }
          });
          return cleanedPoint;
        });
      }
      // For bar charts, use dataPoints directly
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

        {chartType === 'line' && (
          <Button
            variant="outlined"
            startDecorator={<ArrowLeftRight size={18} />}
            onClick={handleSwapAxes}
          >
            Swap Axes
          </Button>
        )}
      </Box>

      <div style={{ height: 400, width: '100%' }}>
        {chartType === 'line' && (
          <ResponsiveLine
            data={getChartData()}
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
            data={getChartData()}
            keys={normalizedData.seriesKeys}
            indexBy="metric"
            margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
            padding={0.3}
            groupMode={
              normalizedData.seriesKeys.length > 1 ? 'grouped' : 'stacked'
            }
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'metric',
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
            data={getChartData()}
            keys={normalizedData.seriesKeys}
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
