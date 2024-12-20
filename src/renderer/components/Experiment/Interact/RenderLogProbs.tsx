import { Chip, Tooltip } from '@mui/joy';
import React from 'react';

function logProbToProbability(logprob) {
  return Math.round(Math.exp(logprob) * 100) / 100;
}

function logProbToColor(logprob: number): string {
  const probability = logProbToProbability(logprob);
  const hue = Math.floor(probability * 240); // Reverse the hue calculation
  const color = `hsl(${hue}, 100%, 70%)`; // Use HSL for more pleasing colors
  return color;
}

function renderListOfLogProbs(logProbs) {
  return logProbs.map((logprob, index) => (
    <div>
      {logprob?.token} - {logProbToProbability(logprob?.logprob)}
    </div>
  ));
}

const RenderLogProbs = ({ logProbs }) => {
  return (
    <div
      style={{
        flex: 1,
        width: '100%',
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
            {logprob?.text}
            <br />
            {logProbToProbability(logprob?.logprobs?.logprob)}
          </span>
        </Tooltip>
      ))}
    </div>
  );
};

export default RenderLogProbs;
