//// filepath: /Users/deep.gandhi/transformerlab-repos/transformerlab-app/src/renderer/components/Experiment/Eval/Chart.tsx
import React, { useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveRadar } from '@nivo/radar';
import { Select, Option, FormControl } from '@mui/joy';

const Chart = ({ metrics, compareChart }) => {
  const [chartType, setChartType] = useState('bar');

  const handleChartTypeChange = (event, newValue) => {
    setChartType(newValue);
  };

  if (!metrics || metrics.length === 0) {
    return <div>No metrics available</div>;
  }


  let barData, lineData, radarData;

  if (compareChart) {
    // For compare mode, multiple evaluators/jobs become separate series.
    // Use evaluator-job as series key.
    const seriesKeys = Array.from(
      new Set(metrics.map(m => `${m.evaluator}-${m.job_id}`))
    );

    // For Bar chart: group by metric type.
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

    // For Line chart: each series is an evaluator-job.
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

    // For Radar chart: similar to bar, but keys represent evaluator-job score.
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
    // Original logic: assume a single series.
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
      <FormControl sx={{ width: 200 }}>
        <Select value={chartType} onChange={handleChartTypeChange}>
          <Option value="bar">Bar</Option>
          <Option value="line">Line</Option>
          <Option value="radar">Radar</Option>
        </Select>
      </FormControl>
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
              stacked: true,
              reverse: false,
            }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'metric',
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
