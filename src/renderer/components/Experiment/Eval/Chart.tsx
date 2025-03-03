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


  let barData, lineData, radarData;

  if (compareChart) {
    // For compare mode, we need to handle the axis swap
    const metricTypes = Array.from(new Set(metrics.map(m => m.type)));
    const seriesKeys = Array.from(
      new Set(metrics.map(m => `${m.evaluator}-${m.job_id}`))
    );

    // For Line chart: handle axis swapping
    if (swapAxes && chartType === 'line') {
      // Swapped axes: each series is a metric type
      const seriesDataMap = {};
      metricTypes.forEach(type => {
        seriesDataMap[type] = { id: type, data: [] };
      });

      metrics.forEach(metric => {
        const { type, evaluator, job_id, score } = metric;
        const seriesKey = `${evaluator}-${job_id}`;
        seriesDataMap[type].data.push({ x: seriesKey, y: score });
      });
      lineData = Object.values(seriesDataMap);
    } else {
      // Normal mode for line chart: each series is an evaluator-job
      const seriesDataMap = {};
      seriesKeys.forEach(series => {
        seriesDataMap[series] = { id: series, data: [] };
      });

      metrics.forEach(metric => {
        const { type, evaluator, job_id, score } = metric;
        const seriesKey = `${evaluator}-${job_id}`;
        seriesDataMap[seriesKey].data.push({ x: type, y: score });
      });
      lineData = Object.values(seriesDataMap);
    }

    // Bar chart: data preparation (unchanged)
    const barDataMap = {};
    metrics.forEach(metric => {
      const { type, evaluator, job_id, score } = metric;
      const seriesKey = `${evaluator}-${job_id}`;
      if (!barDataMap[type]) {
        barDataMap[type] = { type };
      }
      barDataMap[type][seriesKey] = score;
    });
    barData = Object.values(barDataMap);

    // Radar chart: data preparation (unchanged)
    const radarDataMap = {};
    metrics.forEach(metric => {
      const { type, evaluator, job_id, score } = metric;
      const seriesKey = `${evaluator}-${job_id}`;
      if (!radarDataMap[type]) {
        radarDataMap[type] = { metric: type };
      }
      radarDataMap[type][seriesKey] = score;
    });
    radarData = Object.values(radarDataMap);
  } else {
    // Original logic for non-compare mode (unchanged)
    barData = metrics.map(metric => ({
      type: metric.type,
      score: metric.score,
    }));

    lineData = [
      {
        id: 'metrics',
        data: metrics.map(metric => ({ x: metric.type, y: metric.score })),
      }
    ];

    radarData = metrics.map(metric => ({
      metric: metric.type,
      score: metric.score,
    }));
  }

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <FormControl sx={{ width: 200 }}>
          <Select value={chartType} onChange={handleChartTypeChange}>
            <Option value="bar">Bar</Option>
            <Option value="line">Line</Option>
            <Option value="radar">Radar</Option>
          </Select>
        </FormControl>

        {compareChart && chartType === 'line' && (
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
            data={lineData}
            margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
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
              tickRotation: swapAxes && compareChart ? 45 : 0,
              legend: swapAxes && compareChart ? 'experiment' : 'metric',
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
                anchor: 'bottom-right',
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
              }
            ]}
          />
        )}

{chartType === 'bar' && (
          <ResponsiveBar
            data={barData}
            keys={
              compareChart
                ? Array.from(new Set(metrics.map((m) => `${m.evaluator}-${m.job_id}`)))
                : ['score']
            }
            indexBy="type"
            margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
            padding={0.3}
            groupMode={compareChart ? 'grouped' : 'stacked'} // Added groupMode here.
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
{chartType === 'radar' && compareChart && (
  <ResponsiveRadar
    data={(() => {
      // Group metrics by type
      const metricsGroupedByType = {};
      metrics.forEach(metric => {
        const { type, evaluator, job_id, score } = metric;
        const seriesKey = `${evaluator}-${job_id}`;

        if (!metricsGroupedByType[type]) {
          metricsGroupedByType[type] = { metric: type };
        }
        metricsGroupedByType[type][seriesKey] = score;
      });
      return Object.values(metricsGroupedByType);
    })()}
    keys={Array.from(new Set(metrics.map(m => `${m.evaluator}-${m.job_id}`)))}
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
    legends={[
      {
        anchor: 'right',
        direction: 'column',
        translateX: 50,
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
              itemTextColor: '#000'
            }
          }
        ]
      }
    ]}
  />
)}

{chartType === 'radar' && !compareChart && (
  <ResponsiveRadar
    data={radarData}
    keys={['score']}
    indexBy="metric"
    margin={{ top: 70, right: 80, bottom: 40, left: 80 }}
    gridShape="circular"
    gridLabelOffset={36}
    dotSize={10}
    dotColor={{ from: 'color', modifiers: [] }}
    dotBorderWidth={2}
    dotBorderColor={{ from: 'color', modifiers: [] }}
    colors={{ scheme: 'nivo' }}
    fillOpacity={0.25}
    blendMode="multiply"
    animate={true}
    motionConfig="wobbly"
    enableDotLabel={true}
    dotLabel="value"
    dotLabelYOffset={-12}
  />
)}
      </div>
    </>
  );
};

export default Chart;
