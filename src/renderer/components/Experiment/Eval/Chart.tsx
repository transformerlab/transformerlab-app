import React, { useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveRadar } from '@nivo/radar';
import { Select, Option, FormControl } from '@mui/joy';

const Chart = ({ metrics }) => {
  const [chartType, setChartType] = useState('bar');

  const handleChartTypeChange = (event, newValue) => {
    setChartType(newValue);
  };

  if (!metrics || metrics.length === 0) {
    return <div>No metrics available</div>;
  }

  console.log(metrics);

  const data = metrics.map((metric) => ({
    id: metric.type,
    value: metric.score,
  }));

  const lineData = [
    {
      id: 'metrics',
      data: metrics.map((metric) => ({ x: metric.type, y: metric.score })),
    },
  ];

  const barData = metrics.map((metric) => ({
    type: metric.type,
    score: metric.score,
  }));

  const radarData = metrics.map((metric) => ({
    metric: metric.type,
    score: metric.score,
  }));

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
            keys={['score']}
            indexBy="type"
            margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
            padding={0.3}
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
            colorBy="indexValue"
          />
        )}
        {chartType === 'radar' && (
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
