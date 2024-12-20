import { Chip, Tooltip, Typography } from '@mui/joy';
import React from 'react';

function logProbToProbability(logprob) {
  return Math.round(Math.exp(logprob) * 100) / 100;
}

function logProbToColor(logprob: number): string {
  const probability = logProbToProbability(logprob);
  const hue = Math.floor(probability * 100); // Reverse the hue calculation
  const color = `hsl(${hue}, 80%, 80%)`; // Use HSL for more pleasing colors
  return color;
}

function renderListOfLogProbs(logProbs) {
  return logProbs.map((logprob, index) => (
    <div>
      {logProbToProbability(logprob?.logprob)}: {logprob?.token}
    </div>
  ));
}

const RenderLogProbs = ({ logProbs }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
      }}
      id="embeddingsResult"
    >
      {logProbs?.map((logprob, index) => (
        <Tooltip
          title={renderListOfLogProbs(logprob?.logprobs?.top_logprobs)}
          key={index}
          variant="outlined"
        >
          <span
            style={{
              backgroundColor: logProbToColor(logprob?.logprobs?.logprob),
              lineHeight: '1.0',
              margin: '2px',
            }}
          >
            <Typography level="body-md">{logprob?.text}</Typography>
            <Typography level="body-sm">
              {/* {logProbToProbability(logprob?.logprobs?.logprob)}{' '} */}
            </Typography>
          </span>
        </Tooltip>
      ))}
    </div>
  );
};

export default RenderLogProbs;
